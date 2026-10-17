import { test } from "node:test";
import assert from "node:assert/strict";
import { needsExcerpt } from "./excerpt-need.ts";

test("원문 구절을 요구하는 과제만 인용구 검증 대상이다", () => {
  assert.equal(needsExcerpt(["책처방전: 책 제목, 저자, 인상 깊은 구절을 포함"]), true);
  assert.equal(needsExcerpt(["책 속 한 문장을 소개한다"]), true);
  assert.equal(needsExcerpt(["인상 깊게 읽은 책 한 권을 골라 100자 한 줄 서평을 쓰시오"]), false);
  assert.equal(needsExcerpt(["독서 감상문: 줄거리와 느낀 점"]), false);
  assert.equal(needsExcerpt(["출처를 인용하여 작성"]), false);
});
