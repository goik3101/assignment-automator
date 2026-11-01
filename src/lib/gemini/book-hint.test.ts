import { test } from "node:test";
import assert from "node:assert/strict";
import { BOOK_TASK_HINT_PATTERN as P, mentionsBookTask } from "./book-hint.ts";

test("책 과제로 판별", () => {
  for (const t of ["책 한 권을 읽고", "책을 골라", "책의 줄거리", "책처방전 작성", "독서 감상문", "도서 추천", "추천 서적"]) assert.equal(P.test(t), true, t);
});
test("정책·책임·대책 같은 낱말은 책 과제로 보지 않는다", () => {
  for (const t of ["정책 제안서", "사회적 책임", "환경 대책 마련", "해결책 제시", "인권 선구자를 선정"]) assert.equal(P.test(t), false, t);
});

test("자료를 어디서 찾을지 나열한 문장의 '책'은 과제 소재가 아니다", () => {
  const line = "인터넷 검색(백과사전, 신문기사, 인물 평전, 책 내용 등)을 통해 관련된 내용을 수집할 것";
  assert.ok(P.test(line), "낱말 자체는 여전히 걸린다");
  assert.ok(!mentionsBookTask(line), "자료 출처 나열이므로 책 과제가 아니다");
});

test("진짜 책 과제는 그대로 걸린다", () => {
  assert.ok(mentionsBookTask("친구의 문제 상황에 도움을 줄 수 있는 책을 소개함"));
  assert.ok(mentionsBookTask("읽은 책을 바탕으로 카드뉴스를 만든다"));
  assert.ok(mentionsBookTask("책 제목과 저자, 인상적인 구절을 적는다"));
  assert.ok(mentionsBookTask("독서 감상문을 쓴다"));
});

test("자료 나열 문장이 섞여 있어도 다른 문장이 책 과제면 걸린다", () => {
  const two = "인터넷 검색(백과사전, 평전 등)으로 자료를 수집한다. 그 뒤 읽은 책을 소개한다.";
  assert.ok(mentionsBookTask(two));
});

test("책과 무관한 글은 걸리지 않는다", () => {
  assert.ok(!mentionsBookTask("문제의 해결책을 제시한다"));
  assert.ok(!mentionsBookTask("사회 문제의 배경을 설명한다"));
});
