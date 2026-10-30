import { test } from "node:test";
import assert from "node:assert/strict";
import { needsSubjectSelection } from "./selection-need.ts";

const info = (...lines: string[]) => ({ topic: lines[0], requirements: lines.slice(1), task_elements: [] });

test("대상을 고르라는 과제만 자동 선정을 켠다", () => {
  assert.equal(needsSubjectSelection(info("역사 인물 탐구", "탐구할 인물 한 명을 선정하여 보고서를 쓴다")), true);
  assert.equal(needsSubjectSelection(info("사회 문제 탐구", "관심 있는 사회 문제를 하나 골라 분석한다")), true);
  assert.equal(needsSubjectSelection(info("탐구 보고서", "탐구 주제를 정하고 자료를 모은다")), true);
  assert.equal(needsSubjectSelection({ topic: "인물 보고서", requirements: [], task_elements: [{ label: "보고서", description: "", required_items: ["선정 이유"] }] }), true);
});

test("고르라는 말이 아닌데 걸리던 문장들(실측 2026-10-31)", () => {
  // 국어 매체 활용 주제발표 — 이 한 줄 때문에 자동 선정이 발동해 글이 망가졌다.
  assert.equal(needsSubjectSelection(info("매체 활용 주제발표", "글의 목적·주제·예상 독자를 구체적으로 설정하고, 중심 내용과 세부 내용을 구상한다")), false);
  assert.equal(needsSubjectSelection(info("기초연금", "2024년 기초연금 선정기준액을 조사한다")), false);
  assert.equal(needsSubjectSelection(info("안내", "선택 과목 안내에 따라 작성한다")), false);
  assert.equal(needsSubjectSelection(info("모둠 활동", "모둠을 구성하고 역할을 지정하고 활동한다")), false);
  assert.equal(needsSubjectSelection(info("진로", "자신의 진로를 결정하고 이유를 쓴다")), false);
  assert.equal(needsSubjectSelection(info("발표", "발표 순서는 제비뽑기로 정하며 합의하에 바꿀 수 있다")), false);
  assert.equal(needsSubjectSelection(info("발표", "발표 매체를 정하고 자료를 올린다")), false);
});

test("SELECTION_TRIGGER=legacy면 예전 규칙", () => {
  process.env.SELECTION_TRIGGER = "legacy";
  assert.equal(needsSubjectSelection(info("매체 활용", "목적·주제·예상 독자를 구체적으로 설정하고")), true);
  delete process.env.SELECTION_TRIGGER;
});
