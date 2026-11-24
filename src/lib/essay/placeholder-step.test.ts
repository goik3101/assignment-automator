import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlaceholderStep, textOutsideBlanks } from "./placeholder-step.ts";

const BLANK_ONLY = "[직접 작성: 이 부분은 시험 당일 제시되는 자료가 있어야 답할 수 있어요 — 무작위로 뽑은 친구의 고민 원문이 필요함]";

test("빈칸 한 줄뿐인 단계는 채울 자리뿐이다(2026-11-24 국어 책 처방전 2차시)", () => {
  assert.equal(isPlaceholderStep(BLANK_ONLY), true);
  assert.equal(isPlaceholderStep(`### 문제 상황 요약\n${BLANK_ONLY}\n\n### 원인 분석\n[직접 작성: 원인]`), true);
});

test("빈칸이 있어도 다른 글이 충분하면 채울 자리뿐인 단계가 아니다", () => {
  const body = "요즘 내가 가장 해결하고 싶은 고민은 [직접 작성: 구체적인 고민 상황]이다. 이 일은 학교에서 모둠 활동을 할 때 자주 생기고, 그때마다 마음이 무거워진다.";
  assert.equal(isPlaceholderStep(body), false);
});

test("빈칸이 없는 짧은 글은 여기서 거르지 않는다(짧은 글은 따로 본다)", () => {
  assert.equal(isPlaceholderStep("짧은 글이다."), false);
  assert.equal(isPlaceholderStep(""), false);
});

test("소제목·기호를 뺀 글자 수를 센다", () => {
  assert.equal(textOutsideBlanks("### 제목\n[직접 작성: 무엇]\n- 가나다"), 3);
});

test("PLACEHOLDER_GUARD=off면 예전처럼 거르지 않는다", () => {
  process.env.PLACEHOLDER_GUARD = "off";
  try {
    assert.equal(isPlaceholderStep(BLANK_ONLY), false);
  } finally {
    delete process.env.PLACEHOLDER_GUARD;
  }
});

import { blockedStepContent } from "./placeholder-step.ts";

test("자료가 없어 못 쓴 단계는 필수 항목마다 소제목과 빈칸을 둔다(항목이 없으면 한 줄)", () => {
  const items = ["친구의 문제 상황 요약", "원인 분석", "해결책 제안"];
  const out = blockedStepContent(items, "뽑은 친구의 고민이 필요함");
  assert.match(out, /### 친구의 문제 상황 요약\n\[직접 작성: 이 부분은 시험 당일 제시되는 자료가 있어야 답할 수 있어요 — 뽑은 친구의 고민이 필요함\]/);
  assert.match(out, /### 원인 분석\n\[직접 작성: 원인 분석 — 제시된 자료를 보고 직접 쓰기\]/);
  assert.match(out, /### 해결책 제안/);
  assert.equal(isPlaceholderStep(out), true);
  assert.match(blockedStepContent(undefined, ""), /^\[직접 작성: .*자료 필요\]$/);
  assert.match(blockedStepContent(["하나뿐"], "x"), /^\[직접 작성: /);
});
