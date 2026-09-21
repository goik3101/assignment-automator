import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSubject } from "./normalize-subject.ts";

test("제목이 붙은 과목명은 과목만 남긴다", () => {
  assert.equal(normalizeSubject("국어 수행평가: 나의 특별한 하루 - 감각적 글쓰기"), "국어");
  assert.equal(normalizeSubject("[국어 수행평가 안내문]"), "국어");
  assert.equal(normalizeSubject("통합사회 - 인권 선구자"), "통합사회");
});
test("정상적인 과목명은 그대로 둔다", () => {
  for (const s of ["국어", "통합사회", "한국지리", "정보", "영어", "미술"]) assert.equal(normalizeSubject(s), s);
});
test("빈 값은 빈 값", () => assert.equal(normalizeSubject("  "), ""));
