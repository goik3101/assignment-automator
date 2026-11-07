import { test } from "node:test";
import assert from "node:assert/strict";
import { findPageLength, pageLengthForElement } from "./page-length.ts";
import { lengthGuideLines } from "./length-plan.ts";

const r = (t: string) => {
  const p = findPageLength(t);
  return p ? [p.min, p.max] : null;
};

test("쪽·장·매 분량을 글자 수로 환산한다", () => {
  assert.deepEqual(r("A4 1장 이내"), [600, 1000]);
  assert.deepEqual(r("A4 용지 한 장"), [800, 1100]);
  assert.deepEqual(r("1~2쪽"), [800, 2000]);
  assert.deepEqual(r("반 쪽"), [400, 550]);
  assert.deepEqual(r("원고지 5매"), [800, 1100]);
  assert.deepEqual(r("원고지 3매 이상"), [600, 780]);
  assert.deepEqual(r("한 장 분량"), [800, 1100]);
});

test("쪽·장이 글 분량이 아닌 말은 읽지 않는다", () => {
  for (const t of ["카드뉴스 6장", "사진 3장 첨부", "6장면으로 구성", "한 장면", "1학년 2반", "3쪽 이상의 자료를 찾아", "12쪽 책을 읽고", "2매의 포스터"]) {
    assert.equal(r(t), null, t);
  }
});

test("단계가 여럿이면 그 단계를 언급한 문장만, 총량은 단계마다 복사하지 않는다", () => {
  const labels = ["개요", "본문"];
  const el = { label: "본문", description: "본문을 쓴다" };
  assert.equal(pageLengthForElement(el, ["본문은 A4 1장 이내로 쓴다."], "", labels)?.max, 1000);
  assert.equal(pageLengthForElement(el, ["개요와 본문을 합쳐 A4 2장 이내로 쓴다."], "", labels), null);
  assert.equal(pageLengthForElement(el, ["개요는 A4 1장 이내로 쓴다."], "", labels), null);
  assert.equal(pageLengthForElement({ label: "소감", description: "" }, ["A4 1장 이내로 작성"], "", ["소감"])?.max, 1000);
});

test("LINE_LENGTH 꺼짐이면 기본 분량 가이드 그대로, 켜지면 쪽 환산 범위가 대신한다", () => {
  const els = [{ label: "소감", description: "소감을 쓴다" }];
  const ctx = { requirements: ["A4 1장 이내로 작성한다"], guide: "", labels: ["소감"] };
  delete process.env.LINE_LENGTH;
  // 역할 기본값(소감 250~600자)이 LENGTH_TARGET으로 목표 하나(약 450자)로 좁혀졌다.
  assert.match(lengthGuideLines(els, ctx)[0], /450자|250~600자/);
  process.env.LINE_LENGTH = "on";
  try {
    const g = lengthGuideLines(els, ctx)[0];
    assert.match(g, /600~1000자/);
    assert.match(g, /A4 1장 이내/);
  } finally {
    delete process.env.LINE_LENGTH;
  }
});
