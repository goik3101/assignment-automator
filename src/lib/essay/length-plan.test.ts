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
  const t = narrowTarget(el);
  assert.ok(t.target >= 7 * 150, `항목 7개 바닥 1050자 이상이어야 하는데 ${t.target}`);
});

// 2026-11-08 실측: 칸이 열 개가 넘는 카드뉴스가 general 상한 1,100자에 깎여 800자가 됐고 채점이 7/9로 내려갔다.
test("항목이 정한 바닥은 역할 상한으로 깎지 않는다", () => {
  const el = { label: "민주화 운동 카드뉴스", description: "카드뉴스를 구성한다",
    required_items: ["책 제목", "카드 제목", "메시지", "내용", "①", "②", "③", "④", "⑤", "⑥"] };
  const t = narrowTarget(el);
  assert.ok(t.target >= 10 * 150, `칸 10개면 1500자 이상이어야 하는데 ${t.target}`);
  assert.ok(t.max >= 1700, `9/9를 받은 1775자가 범위에 들어야 하는데 상한 ${t.max}`);
});

test("항목이 둘 이하면 바닥을 적용하지 않는다", () => {
  const t = narrowTarget({ label: "소감", description: "", required_items: ["느낀 점"] });
  assert.equal(t.target, 425); // reflection 250~600의 중앙값
});

test("목표는 역할 하한보다 작지 않다(상한은 항목이 많으면 넘을 수 있다)", () => {
  for (const label of ["소감", "선정 이유", "표어", "발표 대본", "탐구 보고서", "개요"]) {
    const el = { label, description: "", required_items: ["가", "나", "다", "라"] };
    const p = planLength(el);
    const t = narrowTarget(el);
    assert.ok(t.target >= p.min, `${label}: ${t.target}이 하한 ${p.min}보다 작다`);
    // 항목 4개 바닥은 600자다 — 그보다 상한이 낮은 역할(표어)에서만 상한을 넘는다.
    if (t.target > p.max) assert.ok(4 * 150 > p.max, `${label}: 항목 바닥 없이 상한 ${p.max}을 넘었다`);
  }
});

test("그림 칸에는 분량 가이드를 주지 않는다", () => {
  const els = [{ label: "만평/광고", description: "만평이나 광고를 구성한다" }, { label: "사설", description: "사설을 쓴다" }];
  const lines = lengthGuideLines(els);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes("사설"));
});
