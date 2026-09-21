import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLengthConstraint, distributeSharedLength } from "./length-parse.ts";

const p = (t: string, english = false) => parseLengthConstraint(t, { english });

test("글자 수: 이상/이하/이내/내외/범위/허용오차", () => {
  assert.deepEqual(p("공백 포함 1200자 이상"), { min: 1200, max: 0 });
  assert.deepEqual(p("700자 이내"), { min: 0, max: 700 });
  assert.deepEqual(p("800~1000자"), { min: 800, max: 1000 });
  assert.deepEqual(p("1500자 내외"), { min: 1350, max: 1650 });
  assert.deepEqual(p("800자 내외 (±50자 허용)"), { min: 750, max: 850 });
});
test("영어 단어 수", () => {
  assert.deepEqual(p("120~150 words"), { min: 120, max: 150, unit: "words" });
  assert.deepEqual(p("100 words 이상"), { min: 100, max: 0, unit: "words" });
  assert.deepEqual(p("150단어 이내"), { min: 0, max: 150, unit: "words" });
});
test("발표 시간은 분량으로 환산한다(한국어 글자수 / 영어 단어수)", () => {
  assert.deepEqual(p("약 3분 분량"), { min: 810, max: 990, unit: undefined });
  assert.deepEqual(p("약 3분", true), { min: 300, max: 390, unit: "words" });
  assert.equal(p("분위기를 살려서"), null);
});
test("전체 분량이 여러 단계에 복사돼 있으면 단계 수로 나눈다", () => {
  const tl = { min: 1350, max: 1650, counts_spaces: true };
  const els = ["a", "b", "c"].map((label) => ({ label, target_length: { ...tl }, _lengthText: "공백 포함 1500자 내외" }));
  const out = distributeSharedLength(els);
  assert.deepEqual(out.map((e) => e.target_length), [
    { min: 450, max: 550, counts_spaces: true },
    { min: 450, max: 550, counts_spaces: true },
    { min: 450, max: 550, counts_spaces: true },
  ]);
  assert.ok(!("_lengthText" in out[0]));
});
test("단계마다 다른 분량, '각각' 분량, 단일 단계는 그대로", () => {
  const a = { label: "1차시", target_length: { min: 180, max: 220, counts_spaces: true }, _lengthText: "200자 내외" };
  const b = { label: "2차시", target_length: { min: 750, max: 850, counts_spaces: true }, _lengthText: "800자 내외(±50자)" };
  assert.deepEqual(distributeSharedLength([a, b]).map((e) => e.target_length?.max), [220, 850]);
  const c = [{ ...a, _lengthText: "각각 200자 이상" }, { ...b, _lengthText: "각각 200자 이상" }];
  assert.deepEqual(distributeSharedLength(c).map((e) => e.target_length?.max), [220, 850]);
  assert.deepEqual(distributeSharedLength([a]).map((e) => e.target_length?.max), [220]);
});
test("하한과 상한이 함께 적힌 경우", () => {
  assert.deepEqual(p("3분 분량(공백 포함 800자 이상 1000자 이하)"), { min: 800, max: 1000 });
  assert.deepEqual(p("800자 이상, 1000자 이내"), { min: 800, max: 1000 });
});
test("'각 기사 200자 이상'처럼 하한만 복사된 값은 나누지 않는다", () => {
  const els = ["a", "b", "c", "d", "e"].map((label) => ({ label, target_length: { min: 200, max: 0, counts_spaces: true }, _lengthText: "200자 이상" }));
  assert.deepEqual(distributeSharedLength(els).map((e) => e.target_length?.min), [200, 200, 200, 200, 200]);
});
