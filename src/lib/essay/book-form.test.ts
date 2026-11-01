import { test } from "node:test";
import assert from "node:assert/strict";
import { bookForm, bookFormBlock } from "./book-form.ts";

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
