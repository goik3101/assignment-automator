import test from "node:test";
import assert from "node:assert/strict";
import { ensureQuestionSteps, questionGroupsFromMaterials } from "./analysis-normalize.ts";

const MATERIALS_SCI09 = [
  "실험 안내: 지시약 반응을 통해 우리 주변 물질의 액성을 확인할 수 있다.",
  "이론 평가 문항 1~2: 표는 다양한 물질의 지시약 반응 결과이다. 물음에 답하시오. 1. 표의 빈칸을 채우시오.",
  "이론 평가 문항 2: 다음은 X를 녹인 수용액의 성질을 알아보기 위한 실험 내용이다. 2-1) A~C 중 X에 해당되는 물질은 무엇인가?",
  "이론 평가 문항 3~5: 그림은 묽은 염산에 수산화 나트륨 수용액을 넣은 것이다. 물음에 답하시오. 3. 어떤 이온을 나타낸 것인가?",
];

test("문항 그룹 이름에서 '1~3' 같은 범위 번호를 뗀다(과학-09: '이론 평가 문항 1~'로 잘려 단계가 둘 더 붙었다)", () => {
  assert.deepEqual(questionGroupsFromMaterials(MATERIALS_SCI09), ["이론 평가 문항"]);
});

test("이미 문항에 답하는 '이론 평가 답안' 단계가 있으면 낱말이 겹쳐 덮인 것으로 본다(과학-09, 생성 통째 실패 사례)", () => {
  const els = [
    { type: "text_submission", label: "실험1 결과 및 분석", description: "표를 채운다" },
    { type: "text_submission", label: "이론 평가 답안", description: "문항 1~5에 답한다" },
  ];
  const r = ensureQuestionSteps(els, MATERIALS_SCI09);
  assert.equal(r.added.length, 0);
  assert.equal(r.steps.length, 2);
});

test("이름이 겹치지 않으면 설명에 적혀 있어도 단계를 붙인다(사회-05)", () => {
  const mats = ["탐구 확인 문제 1: 옳은 것은 ○, 옳지 않은 것은 X로 표시하시오. (1) …"];
  const els = [{ type: "text_submission", label: "탐구(논증) 활동지", description: "활동지의 탐구 확인 문제에도 답한다." }];
  assert.deepEqual(ensureQuestionSteps(els, mats).added, ["탐구 확인 문제"]);
});
