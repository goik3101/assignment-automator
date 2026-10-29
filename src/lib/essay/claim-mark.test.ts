import { test } from "node:test";
import assert from "node:assert/strict";
import { UNVERIFIED_MARK, checkClaims, isOpinionOrPlan, type PageTexts } from "./claim-check.ts";

const PAD = "이 페이지는 다른 주제를 다룬다. ".repeat(20); // 200자 넘는 "읽은" 본문
const pages = (m: Record<number, string | null>): PageTexts => new Map(Object.entries(m).map(([k, v]) => [Number(k), v]));

// 실제 안내문 생성(2026-10-28, 소셜 미디어 주제)에서 코드가 각주를 지웠지만 문장은 그대로 남았던 경우.
const CLAIM = "같은 Pew 보고서는 설문에서 70%의 청소년이 또래 집단에서 불안·우울을 주요 문제라고 응답했다고 기록한다";

test("재현: 수정 전에는 각주만 지워져 근거 없는 수치 문장이 아무 표시 없이 남는다", () => {
  const r = checkClaims(`${CLAIM}[2].`, pages({ 2: PAD }));
  assert.equal(r.content, `${CLAIM}.`);
  assert.equal(r.findings[0].status, "unsupported");
  assert.equal(r.content.includes(UNVERIFIED_MARK), false);
});

test("표시를 켜면 지운 각주 자리에 '[확인 필요]'가 남고 문장은 지우지 않는다", () => {
  const r = checkClaims(`${CLAIM}[2].`, pages({ 2: PAD }), () => 0, { markUnsupported: true });
  assert.equal(r.content, `${CLAIM}${UNVERIFIED_MARK}.`);
  assert.equal(r.findings[0].status, "unsupported");
});

test("읽지 못한 출처 번호는 그대로 두고 그 뒤에 표시한다", () => {
  const r = checkClaims(`${CLAIM}[1][2].`, pages({ 1: null, 2: PAD }), () => 0, { markUnsupported: true });
  assert.equal(r.content, `${CLAIM}[1]${UNVERIFIED_MARK}.`);
});

test("의견·계획 문장은 표시하지 않는다(사실 주장이 아니다)", () => {
  const plan = "2023년 조사 결과를 근거로 학교가 예방 교육을 확대하도록 제안한다";
  assert.equal(isOpinionOrPlan(plan), true);
  assert.equal(isOpinionOrPlan("나는 2023년 조사가 인상 깊었다고 생각한다"), true);
  assert.equal(isOpinionOrPlan(CLAIM), false);
  const r = checkClaims(`${plan}[2].`, pages({ 2: PAD }), () => 0, { markUnsupported: true });
  assert.equal(r.content, `${plan}.`); // 각주는 기존대로 지우되 사실 주장 표시는 붙이지 않는다
});

test("값이 확인된 문장, 페이지를 못 읽은 문장, 다른 출처로 바로잡은 문장에는 표시하지 않는다", () => {
  const ok = checkClaims(`70%의 청소년이 응답했다[1].`, pages({ 1: `${PAD} 70% 청소년` }), () => 0, { markUnsupported: true });
  assert.equal(ok.content, `70%의 청소년이 응답했다[1].`);
  const unread = checkClaims(`70%의 청소년이 응답했다[1].`, pages({ 1: null }), () => 0, { markUnsupported: true });
  assert.equal(unread.content, `70%의 청소년이 응답했다[1].`);
  const moved = checkClaims(`70%의 청소년이 응답했다[1].`, pages({ 1: PAD, 2: `${PAD} 70% 청소년` }), () => 0, { markUnsupported: true });
  assert.equal(moved.content, `70%의 청소년이 응답했다[2].`);
});

test("표시는 숫자 각주 정리(중복·없는 번호 제거) 규칙에 걸리지 않는다", async () => {
  const { cleanMarkers } = await import("../gemini/citation-cleanup.ts");
  const text = `근거다${UNVERIFIED_MARK}. 다음 문장[1][1].`;
  assert.equal(cleanMarkers(text, new Set([1])), `근거다${UNVERIFIED_MARK}. 다음 문장[1].`);
});
