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

import { selectionCount } from "./selection-need.ts";

test("안내문이 서로 다른 대상 여러 개를 고르라고 하면 개수를 읽는다(2026-11-22 가정-01·역사-05·역사-03이 대상 하나로만 써서 틀렸다)", () => {
  const withReqs = (...reqs: string[]) => ({ topic: "t", requirements: reqs, task_elements: [] });
  // 번호가 적힌 선정
  assert.equal(selectionCount(withReqs("인물 두 명을 선정하고 각 인물의 주요 활동을 3가지씩 찾아 기록한다.")), 2);
  assert.equal(selectionCount(withReqs("고구려·백제·신라·발해 중 문화유산 2가지를 선정하고 사진과 함께 설명할 것.")), 2);
  // 한 가지씩을 서로 다른 문장에서 따로 고른다(가정-01)
  assert.equal(
    selectionCount(withReqs("[자료]의 정책 중 효과적인 것을 한 가지 골라 아래 내용을 작성", "[자료]의 정책 중 보완이 필요한 것을 한 가지 골라 아래 내용을 작성")),
    2
  );
  // 같은 "생각하는 것 한 가지를 골라" 꼴로 끝나도 앞말이 다르면 서로 다른 선정이다(재실행에서 두 선정이 한 키로 합쳐졌다)
  assert.equal(
    selectionCount(withReqs("자료의 정책 중 효과적이라고 생각하는 것 한 가지를 골라 정책 명칭을 작성한다.", "자료의 정책 중 보완이 필요하다고 생각하는 것 한 가지를 골라 정책 명칭을 작성한다.")),
    2
  );
  // 한 개 선정이거나, 후보를 고른 뒤 다시 고르는 과제는 1
  assert.equal(selectionCount(withReqs("탐구할 인물 한 명을 선정하여 보고서를 쓴다")), 1);
  assert.equal(selectionCount(withReqs("지질명소 후보 3개를 선정한다.", "후보 중 하나를 골라 조사한다.")), 1);
  // 같은 한 가지 선정을 두 문장이 되풀이해도 2가 아니다
  assert.equal(selectionCount(withReqs("대상을 한 가지 골라 작성한다.", "대상을 한 가지 골라 작성한다.")), 1);
  // 활동 개수("3가지씩 찾아")는 대상 선정이 아니다
  assert.equal(selectionCount(withReqs("선정한 인물의 주요 활동을 3가지 찾아 기록한다.")), 1);
});
