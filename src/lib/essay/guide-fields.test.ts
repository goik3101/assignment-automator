import { test } from "node:test";
import assert from "node:assert/strict";
import { formFieldsFromGuide, mergeGuideFields } from "./guide-fields.ts";

// 실제 분석이 내놓은 작성 기준(2026-11-11, 사회 "경제적 유인")
const GUIDE =
  "양식 칸 분량(대략): 사례 분석표는 사례별로 ‘해결해야 할 행동’, ‘적용된 경제적 유인’, ‘예상되는 행동의 변화’, ‘발생 가능한 문제점·더 나은 경제적 유인’ 칸에 각각 약 5~6줄. " +
  "보고서는 ‘문제 행동’ 약 3줄, ‘경제학적 원인’ 약 5줄, ‘경제적 유인 설계’의 긍정적·부정적 유인 각각 약 6줄, ‘행동 변화 및 파급효과’와 ‘한계점 혹은 부작용’ 각각 약 6줄, ‘최적의 정책 제시’ 약 5줄.";

test("작성 기준에 적힌 칸 이름을 읽는다", () => {
  const f = formFieldsFromGuide(GUIDE);
  assert.ok(f.includes("최적의 정책 제시"), `못 읽었다: ${JSON.stringify(f)}`);
  assert.ok(f.includes("문제 행동"));
  assert.ok(f.includes("경제학적 원인"));
});

test("필수 항목에 빠진 칸만 더한다 (사회 2번: 6칸인데 5칸으로 잡혔다)", () => {
  const required = [
    "관심 분야에서 해결하고 싶은 문제 행동",
    "문제 행동이 유지되는 경제학적 원인",
    "문제를 해결하기 위한 경제적 유인 설계",
    "예상되는 행동의 변화 및 파급효과",
    "기획한 경제적 유인의 한계점 혹은 발생 가능한 부작용",
  ];
  const merged = mergeGuideFields(required, GUIDE);
  assert.ok(merged.includes("최적의 정책 제시"), "빠진 칸이 안 더해졌다");
  assert.equal(merged.length, 6, `겹치는 이름까지 더했다: ${JSON.stringify(merged)}`);
  // 작성 기준의 짧은 이름("문제 행동", "한계점 혹은 부작용")이 긴 원래 이름과 겹치면 더하지 않는다
  assert.ok(!merged.includes("문제 행동"), "짧은 이름이 따로 들어갔다");
  assert.ok(!merged.includes("한계점 혹은 부작용"), "짧은 이름이 따로 들어갔다");
});

test("작성 기준이 없거나 칸 이름이 없으면 그대로 둔다", () => {
  assert.deepEqual(mergeGuideFields(["가", "나"], undefined), ["가", "나"]);
  assert.deepEqual(mergeGuideFields(["가"], "자유롭게 작성한다."), ["가"]);
  assert.deepEqual(formFieldsFromGuide(""), []);
});
