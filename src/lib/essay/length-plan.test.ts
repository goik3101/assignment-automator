import { test } from "node:test";
import assert from "node:assert/strict";
import { narrowTarget, planLength, lengthGuideLines } from "./length-plan.ts";

// ── 목표 하나로 좁히기 (LENGTH_TARGET) ─────────────────────
test("범위 대신 목표 하나 ±20%로 좁힌다", () => {
  const t = narrowTarget({ label: "스토리보드", description: "", required_items: ["화면", "대사"] });
  assert.equal(t.target, 800); // general 500~1100의 중앙값
  assert.deepEqual([t.min, t.max], [640, 960]);
});

test("항목이 많은 개요는 항목당 150자를 바닥으로 둔다", () => {
  const el = { label: "개요", description: "개요를 쓴다", required_items: ["목적", "주제", "독자", "중심 내용", "세부 내용", "근거", "출처"] };
  const plain = planLength(el);
  const t = narrowTarget(el);
  assert.ok(t.target >= 7 * 150, `항목 7개 바닥 1050자 이상이어야 하는데 ${t.target}`);
  assert.ok(t.target <= plain.max, "역할이 정한 상한은 넘지 않는다");
});

test("항목이 둘 이하면 바닥을 적용하지 않는다", () => {
  const t = narrowTarget({ label: "소감", description: "", required_items: ["느낀 점"] });
  assert.equal(t.target, 425); // reflection 250~600의 중앙값
});

test("목표는 역할 범위 안에 있다", () => {
  for (const label of ["소감", "선정 이유", "표어", "발표 대본", "탐구 보고서", "개요"]) {
    const el = { label, description: "", required_items: ["가", "나", "다", "라"] };
    const p = planLength(el);
    const t = narrowTarget(el);
    assert.ok(t.target >= p.min && t.target <= p.max, `${label}: ${t.target}이 ${p.min}~${p.max} 밖`);
  }
});
