import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFormRulesBlock } from "./form-rules.ts";

test("실험 틀(가설-변인-방법-예상)은 안내문이 가설·변인·설계를 직접 요구할 때만 — '원리를 설명하시오'에는 안 붙는다(2026-11-27 과학-02)", () => {
  const explain = buildFormRulesBlock([{ label: "실험1 원리 설명", description: "실험1에서 물이 이동하는 원리를 압력 차이를 이용하여 설명한다." }]);
  assert.doesNotMatch(explain, /가설-변인/);
  assert.match(explain, /원리를 과학 개념으로 직접 설명/);
  const design = buildFormRulesBlock([{ label: "실험 예비 보고서", description: "가설을 세우고 변인을 통제하는 실험을 설계한다." }]);
  assert.match(design, /가설-변인\(독립·종속·통제\)-방법-예상 결과/);
  const byItems = buildFormRulesBlock([{ label: "실험 예비 보고서", description: "실험을 계획한다.", required_items: ["가설", "방법"] }]);
  assert.match(byItems, /가설-변인/);
  process.env.EXPERIMENT_SCAFFOLD = "legacy";
  try {
    assert.match(buildFormRulesBlock([{ label: "실험1 원리 설명", description: "원리를 설명한다." }]), /가설-변인/);
  } finally {
    delete process.env.EXPERIMENT_SCAFFOLD;
  }
});
