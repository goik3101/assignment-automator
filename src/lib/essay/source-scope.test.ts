import { test } from "node:test";
import assert from "node:assert/strict";
import { isDomesticUrl, keepInScope, parseSourceScope } from "./source-scope.ts";
import { buildRequestBody } from "../llm/providers/openai-core.ts";
import { currentSourceScope, withSourceScope } from "../llm/scope.ts";

test("출처 범위 값: 'domestic'만 국내, 나머지(없음 포함)는 전체", () => {
  assert.equal(parseSourceScope("domestic"), "domestic");
  for (const v of ["all", undefined, null, "DOMESTIC", 1]) assert.equal(parseSourceScope(v), "all");
});

test("국내 출처 판정: .kr·한국 사이트·한국어 위키는 국내, 영문 위키·해외 기관은 해외", () => {
  for (const u of [
    "https://encykorea.aks.ac.kr/Article/E0039590",
    "https://www.yes24.com/Product/Goods/89829707",
    "https://ko.wikipedia.org/wiki/4·19_혁명",
    "https://n.news.naver.com/article/001/0000001",
    "https://www.changbi.com/BookDetail?bookid=3418",
    "https://www.korea.kr/news",
    "https://www.mirae-n.com/UPLOAD/a.pdf",
    "https://www.wonedu.org/x",
    "https://www.visang.com/upload/b.pdf",
  ])
    assert.equal(isDomesticUrl(u), true, u);
  for (const u of ["https://en.wikipedia.org/wiki/April_Revolution", "https://www.britannica.com/event/x", "https://www.nasa.gov/", "not a url"])
    assert.equal(isDomesticUrl(u), false, u);
  const items = [{ url: "https://www.hani.co.kr/a" }, { url: "https://www.bbc.com/b" }];
  assert.deepEqual(keepInScope(items, "domestic"), [items[0]]);
  assert.deepEqual(keepInScope(items, "all"), items);
});

test("국내 범위 검색 요청: 위치를 한국으로 두고 한국 사이트 지시를 붙인다(전체 범위는 그대로)", async () => {
  const req = { label: "t", role: "main" as const, prompt: "x", search: { force: true } };
  const dom = buildRequestBody(req, "gpt-5-mini", { sourceScope: "domestic" }) as { tools: { user_location?: unknown }[]; instructions?: string };
  assert.deepEqual(dom.tools[0].user_location, { type: "approximate", country: "KR" });
  assert.match(dom.instructions ?? "", /국내 출처만/);
  const all = buildRequestBody(req, "gpt-5-mini", { sourceScope: "all" }) as { tools: { user_location?: unknown }[]; instructions?: string };
  assert.equal(all.tools[0].user_location, undefined);
  assert.equal(all.instructions, undefined);
  assert.equal(currentSourceScope(), "all");
  assert.equal(await withSourceScope("domestic", async () => currentSourceScope()), "domestic");
});

test("국내 범위 지시는 검색 연산자(site:)를 쓰지 말라고 하고, 그 자체에 site: 예시를 넣지 않는다", async () => {
  const { DOMESTIC_SEARCH_RULE } = await import("./source-scope.ts");
  assert.match(DOMESTIC_SEARCH_RULE, /검색 연산자/);
  assert.doesNotMatch(DOMESTIC_SEARCH_RULE, /site:\.kr/);
});
