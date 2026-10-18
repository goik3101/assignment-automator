import { test } from "node:test";
import assert from "node:assert/strict";
import { isFresh, researchCacheKey, validateCachedNotes, worthCaching } from "./research-cache-key.ts";

const base = { scopeKey: "c1", subject: "국어" };

test("같은 수행평가·같은 대상이면 표기 차이(공백·따옴표)가 있어도 같은 키", () => {
  const a = researchCacheKey({ ...base, book: { title: "『어린 왕자』", author: "생텍쥐페리" } });
  const b = researchCacheKey({ ...base, book: { title: "어린 왕자", author: " 생텍쥐페리 " } });
  assert.ok(a && a === b);
});

test("수행평가·책·대상·지침·과목이 다르면 키도 다르다", () => {
  const k = researchCacheKey({ ...base, book: { title: "어린 왕자" } });
  assert.notEqual(k, researchCacheKey({ ...base, scopeKey: "c2", book: { title: "어린 왕자" } }));
  assert.notEqual(k, researchCacheKey({ ...base, book: { title: "데미안" } }));
  assert.notEqual(k, researchCacheKey({ ...base, book: { title: "어린 왕자" }, instructions: "환경 위주로" }));
  assert.notEqual(k, researchCacheKey({ ...base, subject: "영어", book: { title: "어린 왕자" } }));
  assert.notEqual(researchCacheKey({ ...base, subjectName: "방정환" }), researchCacheKey({ ...base, subjectName: "유관순" }));
});

test("수행평가 식별자가 없으면 캐시를 쓰지 않는다(null)", () => {
  assert.equal(researchCacheKey({ scopeKey: null, subject: "국어" }), null);
  assert.equal(researchCacheKey({ scopeKey: undefined, subject: "국어" }), null);
});

test("신선도: 만료일이 지나면 오래된 것", () => {
  const now = Date.parse("2026-10-19T00:00:00Z");
  assert.equal(isFresh("2026-10-10T00:00:00Z", 14, now), true);
  assert.equal(isFresh("2026-10-01T00:00:00Z", 14, now), false);
  assert.equal(isFresh("not-a-date", 14, now), false);
});

const good = { facts: Array.from({ length: 5 }, (_, i) => ({ id: `F${i + 1}`, fact: `사실 ${i}`, url: `https://a.org/${i}`, title: "t" })), queries: ["q"], book: { title: "어린 왕자", author: "생텍쥐페리" } };

test("저장된 노트가 정상이면 읽고, 깨졌거나 사실이 적으면 버린다", () => {
  assert.equal(validateCachedNotes(good, 4)?.facts.length, 5);
  assert.equal(validateCachedNotes(good, 4)?.book?.author, "생텍쥐페리");
  assert.equal(validateCachedNotes({ ...good, facts: good.facts.slice(0, 2) }, 4), null);
  assert.equal(validateCachedNotes({ facts: [{ id: "F1", fact: "x", url: "javascript:alert(1)" }] }, 1), null);
  assert.equal(validateCachedNotes(null, 4), null);
  assert.equal(validateCachedNotes("문자열", 4), null);
});

test("저장 기준: 사실 8개 미만이거나, 책인데 서지 사실이 없으면 저장하지 않는다", () => {
  const mk = (n: number, biblio = false) => Array.from({ length: n }, (_, i) => ({ id: `F${i + 1}`, fact: `사실 ${i}`, url: `https://a.org/${i}`, title: "t", ...(biblio && i === 0 ? { printedTitle: "T", printedAuthor: "A" } : {}) }));
  assert.equal(worthCaching({ facts: mk(10) }), true);
  assert.equal(worthCaching({ facts: mk(5) }), false);
  assert.equal(worthCaching({ facts: mk(10), book: { title: "x" } }), false);
  assert.equal(worthCaching({ facts: mk(10, true), book: { title: "x" } }), true);
});
