import { test } from "node:test";
import assert from "node:assert/strict";
import { bookForm, bookFormBlock, isReadingActivity, bookThreadBlock } from "./book-form.ts";

const FACTS = [
  { text: "윤태호의 사일구는 민주화운동기념사업회가 기획한 '만화로 보는 민주화운동' 시리즈다.", title: "사일구 소개" },
  { text: "4·19혁명은 1960년에 일어났다.", title: "한국민족문화대백과사전" },
];

test("조사로 확인된 사실에서 책의 형태를 읽는다", () => {
  assert.equal(bookForm(FACTS, "사일구"), "만화");
});

test("다른 책 이야기에는 걸리지 않는다", () => {
  assert.equal(bookForm(FACTS, "빗창"), null);
});

test("형태를 모르면 아무 지시도 더하지 않는다", () => {
  assert.equal(bookForm([{ text: "4·19혁명 개요" }], "사일구"), null);
  assert.equal(bookFormBlock(null, "사일구"), "");
});

test("만화면 만화 컷으로 그리게 하고, 장면 지어내기를 막는다", () => {
  const b = bookFormBlock("만화", "사일구");
  assert.ok(b.includes("만화의 한 컷"));
  assert.ok(b.includes("지어내지 말 것"));
});

test("'만화가'·'만화화' 같은 말에는 걸리지 않는다", () => {
  assert.equal(bookForm([{ text: "사일구의 만화가 윤태호" }], "사일구"), null);
});

test("독후 활동 판정", () => {
  assert.equal(isReadingActivity(["한국사2 현대사 독후 활동"]), true);
  assert.equal(isReadingActivity(["읽은 책 한 권을 골라 카드뉴스를 만든다"]), true);
  assert.equal(isReadingActivity(["책을 읽고 느낀 점을 쓴다"]), true);
  assert.equal(isReadingActivity(["현대사 신문을 만든다"]), false);
  assert.equal(isReadingActivity(["신문 기사를 읽고 분석한다"]), false); // 기사지 책이 아니다
  // 저장된 분석 3건 중 2건이 이 표현이었다(2026-11-09)
  assert.equal(isReadingActivity(["윤태호 작가의 《사일구》를 읽고 4·19혁명을 주제로 카드뉴스 만들기"]), true);
  assert.equal(isReadingActivity(["『데미안』을 읽고 감상문을 쓴다"]), true);
  assert.equal(isReadingActivity(["제시된 지문을 읽고 물음에 답하시오"]), false);
  // 학생이 지침에 적는 표현(실측 2026-11-09: 이게 빠져 블록이 세 번 다 안 붙었다)
  assert.equal(isReadingActivity(["책: 윤태호 작가의 《사일구》를 읽었다."]), true);
  // 제목 뒤 괄호가 끼어도 읽어야 한다(실측 2026-11-09: 이것 때문에 네 번 돌 동안 블록이 안 붙었다)
  assert.equal(isReadingActivity(["책: 윤태호 작가의 《사일구》(4·19혁명)를 읽었다."]), true);
  assert.equal(isReadingActivity(["내가 읽은 책은 『데미안』이다"]), true);
});

test("독후 활동 블록은 칸 수의 절반을 책으로 채우게 한다", () => {
  const b = bookThreadBlock("사일구", 6);
  assert.match(b, /『사일구』/);
  assert.match(b, /\*\*적어도 3칸\*\*/);
  assert.match(b, /지어내지 말 것/);
  assert.equal(bookThreadBlock("", 6), "");
  assert.match(bookThreadBlock("사일구", 1), /글 곳곳에서/);
});
