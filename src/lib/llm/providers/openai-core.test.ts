/* eslint-disable @typescript-eslint/no-explicit-any */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildRequestBody, cleanUrl, extractCitations, normalizeResponse, classifyHttpError, checkBody, isReasoningModel, type OpenAiResponse } from "./openai-core.ts";
import { buildSourceList, insertCitationMarkers } from "../../gemini/citations.ts";

const fx = (n: string) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8")) as OpenAiResponse;

// 마커 삽입 결과에서 [n]만 지운 것과 정리된 본문이 같아야 한다(글자 손실·위치 어긋남 검사)
const stripMarkers = (s: string) => s.replace(/\[\d+\]/g, "");

test("요청: gpt-5 계열은 temperature를 보내지 않고 reasoning.effort를 쓴다 / 비추론 모델은 temperature 허용", () => {
  const a = buildRequestBody({ label: "t", role: "main", prompt: "x", temperature: 0 }, "gpt-5-mini");
  assert.equal("temperature" in a, false);
  assert.deepEqual(a.reasoning, { effort: "low" });
  const b = buildRequestBody({ label: "t", role: "main", prompt: "x", temperature: 0 }, "gpt-4.1-mini");
  assert.equal(b.temperature, 0);
  assert.equal("reasoning" in b, false);
  assert.equal(a.store, false);
});

test("요청: 검색이 켜지면 minimal 추론을 low로 올리고 tool_choice를 force에 따라 정한다", () => {
  const a = buildRequestBody({ label: "t", role: "main", prompt: "x", effort: "minimal", search: {} }, "gpt-5-mini");
  assert.deepEqual(a.reasoning, { effort: "low" });
  assert.equal(a.tool_choice, "auto");
  const b = buildRequestBody({ label: "t", role: "main", prompt: "x", search: { force: true } }, "gpt-5-mini");
  assert.equal(b.tool_choice, "required");
  assert.deepEqual(b.tools, [{ type: "web_search", search_context_size: "low" }]);
  const c = buildRequestBody({ label: "t", role: "lite", prompt: "x", effort: "minimal" }, "gpt-5-mini");
  assert.deepEqual(c.reasoning, { effort: "minimal" }); // 검색 없으면 minimal 유지
});

test("요청: 이미지 파트는 data URL input_image로, 스키마는 strict json_schema로", () => {
  const body = buildRequestBody(
    { label: "analyze:img", role: "lite", prompt: [{ image: { base64: "AAAA", mimeType: "image/png" } }, { text: "분석" }], schema: { type: "OBJECT", properties: { a: { type: "STRING" } }, required: ["a"] } as never },
    "gpt-5-mini"
  ) as any;
  assert.equal(body.input[0].content[0].type, "input_image");
  assert.equal(body.input[0].content[0].image_url, "data:image/png;base64,AAAA");
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.name, "analyze_img");
  assert.equal(body.text.format.schema.additionalProperties, false);
});

test("URL 정리: utm_* 추적 파라미터 제거, 다른 쿼리는 유지", () => {
  assert.equal(cleanUrl("https://en.wikipedia.org/wiki/Henry_Dunant?utm_source=openai"), "https://en.wikipedia.org/wiki/Henry_Dunant");
  assert.equal(cleanUrl("https://a.com/x?id=3&utm_source=openai"), "https://a.com/x?id=3");
  assert.equal(cleanUrl("https://a.com/x"), "https://a.com/x");
});

test("실제 응답(gpt-5-nano): 인라인 링크가 본문에서 사라지고 출처 위치로 바뀐다", () => {
  const resp = fx("openai-search-nano.json");
  const n = normalizeResponse(resp, true);
  assert.ok(!/\]\(http/.test(n.text), n.text);
  assert.ok(!n.text.includes("utm_source"));
  assert.equal(n.grounding!.chunks.length, 2);
  assert.ok(n.grounding!.chunks.every((c) => !c.web!.uri!.includes("utm_")));
  assert.ok(n.usage.searchCalls >= 1);
  const { sources, chunkIndexToN } = buildSourceList(n.grounding!.chunks);
  const annotated = insertCitationMarkers(n.text, n.grounding!.supports, chunkIndexToN);
  assert.match(annotated, /1828년에 태어났다\[1\]\./);
  assert.match(annotated, /1859년에 벌어졌다\[2\]\./);
  assert.equal(stripMarkers(annotated), n.text); // 글자 손실 없음
  assert.equal(sources.length, 2);
});

test("실제 응답(gpt-5-mini, 한국어): 마커를 지우면 정리된 본문과 정확히 같다", () => {
  const resp = fx("openai-search-mini.json");
  const n = normalizeResponse(resp, true);
  const { chunkIndexToN } = buildSourceList(n.grounding!.chunks);
  const annotated = insertCitationMarkers(n.text, n.grounding!.supports, chunkIndexToN);
  assert.equal(stripMarkers(annotated), n.text);
  assert.ok((annotated.match(/\[\d+\]/g) ?? []).length >= 2);
});

test("annotation이 없는 인라인 링크도 URL을 읽어 출처로 바꾼다", () => {
  const ex = extractCitations("솔페리노 전투는 1859년에 있었다. ([icrc.org](https://icrc.org/a?utm_source=openai)) 다음 문장.", []);
  assert.equal(ex.text, "솔페리노 전투는 1859년에 있었다. 다음 문장.");
  assert.equal(ex.chunks[0].web!.uri, "https://icrc.org/a");
  assert.equal(ex.supports[0].segment!.endIndex, "솔페리노 전투는 1859년에 있었다".length);
});

test("한 자리에 출처가 여러 개면 한 마커 묶음으로 합치고, 같은 URL은 한 번만 센다", () => {
  const text = "가나다라마. ([a.com](https://a.com/1)) ([b.com](https://b.com/2)) 바사. ([a.com](https://a.com/1))";
  const l1 = "([a.com](https://a.com/1))";
  const l2 = "([b.com](https://b.com/2))";
  const ann = [
    { type: "url_citation", start_index: text.indexOf(l1), end_index: text.indexOf(l1) + l1.length, url: "https://a.com/1", title: "A" },
    { type: "url_citation", start_index: text.indexOf(l2), end_index: text.indexOf(l2) + l2.length, url: "https://b.com/2", title: "B" },
    { type: "url_citation", start_index: text.lastIndexOf(l1), end_index: text.length, url: "https://a.com/1", title: "A" },
  ];
  const ex = extractCitations(text, ann);
  assert.equal(ex.chunks.length, 2);
  const { chunkIndexToN } = buildSourceList(ex.chunks);
  const out = insertCitationMarkers(ex.text, ex.supports, chunkIndexToN);
  assert.equal(out, "가나다라마[1][2]. 바사[1].");
});

test("한글+영문 혼합 본문에서도 UTF-16 위치가 정확하다(바이트로 잘못 읽으면 어긋남)", () => {
  const link = "([en.wikipedia.org](https://en.wikipedia.org/wiki/X?utm_source=openai))";
  const text = `뒤낭은 Henry Dunant로 불린다. ${link} 그는 1901년에 상을 받았다. ${link}`;
  const ann = [...text.matchAll(/\(\[en\.wikipedia\.org\]\([^)]+\)\)/g)].map((m) => ({ type: "url_citation", start_index: m.index!, end_index: m.index! + m[0].length, url: "https://en.wikipedia.org/wiki/X?utm_source=openai", title: "X" }));
  const ex = extractCitations(text, ann);
  const { chunkIndexToN } = buildSourceList(ex.chunks);
  const out = insertCitationMarkers(ex.text, ex.supports, chunkIndexToN);
  assert.equal(out, "뒤낭은 Henry Dunant로 불린다[1]. 그는 1901년에 상을 받았다[1].");
});

test("본문에 연속 공백이 있어도 각주 위치가 어긋나지 않는다(정리된 본문의 글자 위치 그대로)", () => {
  const link = "([a.com](https://a.com/1))";
  const text = `가나  다라마. ${link} 바사   아자차. ${link}`;
  const first = text.indexOf(link);
  const second = text.lastIndexOf(link);
  const ann = [first, second].map((i) => ({ type: "url_citation", start_index: i, end_index: i + link.length, url: "https://a.com/1", title: "A" }));
  const ex = extractCitations(text, ann);
  const { chunkIndexToN } = buildSourceList(ex.chunks);
  assert.equal(insertCitationMarkers(ex.text, ex.supports, chunkIndexToN), "가나  다라마[1]. 바사   아자차[1].");
});

test("오류 분류: 429는 재시도, insufficient_quota는 즉시 실패, 5xx 재시도, 401 인증", () => {
  assert.equal(classifyHttpError(429, { error: { code: "rate_limit_exceeded", message: "slow" } }, 2000).kind, "rate_limit");
  assert.equal(classifyHttpError(429, { error: { code: "rate_limit_exceeded" } }, 2000).retryAfterMs, 2000);
  const q = classifyHttpError(429, { error: { code: "insufficient_quota", message: "You exceeded your current quota" } });
  assert.equal(q.kind, "quota");
  assert.equal(q.retryable, false);
  assert.equal(classifyHttpError(503, null).retryable, true);
  assert.equal(classifyHttpError(401, null).kind, "auth");
  assert.equal(classifyHttpError(400, { error: { message: "Tool 'web_search_preview' is not supported with gpt-4.1-nano." } }).kind, "tool");
});

test("본문 오류: 추론이 출력 한도를 다 쓴 빈 응답 / 거절 / 빈 본문을 구분한다", () => {
  const empty = { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [{ type: "reasoning" }], usage: { output_tokens: 200 } } as OpenAiResponse;
  const e = checkBody(empty, normalizeResponse(empty, false))!;
  assert.equal(e.kind, "empty_output");
  assert.equal(e.retryable, true);
  const refusal = { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "cannot" }] }] } as OpenAiResponse;
  assert.equal(checkBody(refusal, normalizeResponse(refusal, false))!.kind, "invalid_output");
  const ok = { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "안녕", annotations: [] }] }] } as OpenAiResponse;
  assert.equal(checkBody(ok, normalizeResponse(ok, false)), null);
  const failed = { status: "failed", error: { code: "server_error", message: "boom" } } as OpenAiResponse;
  assert.equal(checkBody(failed, normalizeResponse(failed, false))!.kind, "server");
});

test("모델 판별", () => {
  assert.equal(isReasoningModel("gpt-5-nano"), true);
  assert.equal(isReasoningModel("gpt-4.1-mini"), false);
});
