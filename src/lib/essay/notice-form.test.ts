import { test } from "node:test";
import assert from "node:assert/strict";
import { readNoticeForms, recoverFormFields, sameField } from "./notice-form.ts";

// 2026-11-11 사회 "경제적 유인" 안내문 원문 전사(실제 분석 결과 그대로)
const SOCIAL = [
  "2026년 9월 8일 | 경제적 유인 만들어 보기 | 학번: ___ | 이름: ___",
  "1. 위 사례를 읽고 아래 표를 채워 보세요.",
  "|  | 해결해야 할 행동 | 적용된 경제적 유인 ① 긍정/부정 | 예상되는 행동의 변화 |",
  "| 사례1 | ___ | ___ | ___ |",
  "| 사례2 | ___ | ___ | ___ |",
  "2. 주변에서 행동을 변화시키고 싶은 사례를 찾아보자.",
  "행동 변화 프로젝트 보고서",
  "| 관심 분야에서 해결하고 싶은 문제 행동 | ___ |",
  "| 문제 행동이 유지되는 경제학적 원인 | ___ |",
  "| 문제를 해결하기 위한 경제적 유인 설계 | 긍정적 유인: ___ | 부정적 유인: ___ |",
  "| 예상되는 행동의 변화 및 파급효과 | ___ |",
  "| 기획한 경제적 유인의 한계점 혹은 발생 가능한 부작용 | ___ |",
  "| 위에서 분석한 결과를 바탕으로 두 유인을 결합하거나 보완한 최적의 정책 제시 | ___ |",
].join("\n");

test("머리줄이 있는 표는 열과 줄을 가른다", () => {
  const f = readNoticeForms(SOCIAL);
  assert.deepEqual(f.columns, ["해결해야 할 행동", "적용된 경제적 유인 ① 긍정/부정", "예상되는 행동의 변화"]);
  assert.deepEqual(f.rowLabels, ["사례1", "사례2"]);
});

test("칸 이름 + 빈칸 줄에서 칸 이름을 읽고, 값 칸의 이름까지 읽는다", () => {
  const f = readNoticeForms(SOCIAL);
  assert.ok(f.fields.includes("관심 분야에서 해결하고 싶은 문제 행동"));
  assert.ok(f.fields.includes("긍정적 유인"));
  assert.ok(f.fields.includes("부정적 유인"));
  assert.ok(f.fields.includes("위에서 분석한 결과를 바탕으로 두 유인을 결합하거나 보완한 최적의 정책 제시"));
});

test("분석이 흘린 칸을 그 단계에 되돌린다 (2026-11-11 실측: 6칸 중 5칸만 잡혔다)", () => {
  const steps = [
    { label: "사례 분석표", required_items: ["해결해야 할 행동", "적용된 경제적 유인 ① 긍정/부정 ② 구체적으로", "예상되는 행동의 변화"] },
    {
      label: "행동 변화 프로젝트 보고서",
      required_items: [
        "관심 분야에서 해결하고 싶은 문제 행동",
        "문제 행동이 유지되는 경제학적 원인",
        "문제를 해결하기 위한 경제적 유인 설계",
        "긍정적 유인",
        "부정적 유인",
        "예상되는 행동의 변화 및 파급효과",
        "기획한 경제적 유인의 한계점 혹은 발생 가능한 부작용",
      ],
    },
  ];
  const out = recoverFormFields(steps, SOCIAL);
  assert.equal(out[0].length, 3, "1번 단계는 그대로");
  assert.ok(out[1].some((i) => i.includes("최적의 정책")), "빠진 6번째 칸이 2번 단계에 들어간다");
  assert.equal(out[1].length, 8);
});

test("표가 없으면 아무것도 바꾸지 않는다", () => {
  const steps = [{ label: "탐구 보고서", required_items: ["탐구 주제", "탐구 과정"] }];
  const plain = "1차시 실험은 모둠별로 실시한다. 2차시는 개별 평가다.\n보고서에 탐구 주제와 과정을 쓴다.";
  assert.deepEqual(recoverFormFields(steps, plain), [["탐구 주제", "탐구 과정"]]);
  assert.deepEqual(recoverFormFields(steps, undefined), [["탐구 주제", "탐구 과정"]]);
});

test("어느 단계인지 가릴 수 없는 칸은 손대지 않는다", () => {
  const steps = [{ label: "신문", required_items: ["머리기사"] }];
  const other = "| 전혀 다른 칸 | ___ |\n| 또 다른 칸 | ___ |";
  assert.deepEqual(recoverFormFields(steps, other), [["머리기사"]]);
});

test("같은 칸인지는 낱말 겹침으로 본다", () => {
  assert.equal(sameField("한계점 혹은 부작용", "기획한 경제적 유인의 한계점 혹은 발생 가능한 부작용"), true);
  assert.equal(sameField("최적의 정책 제시", "예상되는 행동의 변화"), false);
});
