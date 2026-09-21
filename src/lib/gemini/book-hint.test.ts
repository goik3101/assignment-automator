import { test } from "node:test";
import assert from "node:assert/strict";
import { BOOK_TASK_HINT_PATTERN as P } from "./book-hint.ts";

test("책 과제로 판별", () => {
  for (const t of ["책 한 권을 읽고", "책을 골라", "책의 줄거리", "책처방전 작성", "독서 감상문", "도서 추천", "추천 서적"]) assert.equal(P.test(t), true, t);
});
test("정책·책임·대책 같은 낱말은 책 과제로 보지 않는다", () => {
  for (const t of ["정책 제안서", "사회적 책임", "환경 대책 마련", "해결책 제시", "인권 선구자를 선정"]) assert.equal(P.test(t), false, t);
});
