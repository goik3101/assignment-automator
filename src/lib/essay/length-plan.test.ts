import { test } from "node:test";
import assert from "node:assert/strict";
import { narrowTarget, planLength, lengthGuideLines, lengthRoleOf, effectiveTarget } from "./length-plan.ts";

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
    // 항목 4개 바닥은 600자다(항목당 150자) — 그보다 상한이 낮은 역할에서만 상한을 넘는다.
    if (t.target > p.max) assert.ok(4 * 150 > p.max, `${label}: 항목 바닥 없이 상한 ${p.max}을 넘었다`);
  }
});

test("그림 칸에는 분량 가이드를 주지 않는다", () => {
  const els = [{ label: "만평/광고", description: "만평이나 광고를 구성한다" }, { label: "사설", description: "사설을 쓴다" }];
  const lines = lengthGuideLines(els);
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes("사설"));
});

test("한 지면을 나눠 맡은 칸은 칸 하나 분량이다 (채점된 실제 분량에 맞춘 역할)", () => {
  const sibs = [
    { label: "머리기사", description: "신문 양식의 머리기사 칸에 제목과 내용을 작성한다." },
    { label: "인터뷰", description: "신문 양식의 인터뷰 칸에 질문과 답변을 작성한다." },
    { label: "사설/칼럼", description: "신문 양식의 사설/칼럼 칸에 제목과 내용을 작성한다." },
  ];
  const ctx = { topic: "광복부터 정부 수립 사이의 현대사를 주제로 신문 만들기", siblings: sibs };
  for (const el of sibs) {
    assert.equal(lengthRoleOf({ ...el, required_items: ["제목", "내용"] }, ctx), "form_box", el.label);
    const t = narrowTarget({ ...el, required_items: ["제목", "내용"] }, ctx);
    // 만점 결과물 실측 930·687·362자가 모두 0.5~2배 안에 들어오는 목표
    for (const real of [930, 687, 362]) {
      const ratio = t.target / real;
      assert.ok(ratio > 0.5 && ratio < 2, `${el.label}: 목표 ${t.target} / 실제 ${real} = ${ratio.toFixed(2)}배`);
    }
  }
  // 형제 정보가 없으면 예전 분류 그대로(측정 스크립트·기존 호출부가 깨지지 않게)
  assert.notEqual(lengthRoleOf({ label: "사설/칼럼", description: "사설을 쓴다" }), "form_box");
});

test("자료를 붙이고 설명만 적는 칸은 붙임 분량이다", () => {
  const el = { label: "신문 기사 스크랩", description: "관련 신문 기사를 찾아 스크랩해 수행평가지에 붙인다. 제목·날짜·출처가 보이도록 출력한다." };
  assert.equal(lengthRoleOf(el), "attachment");
  const t = narrowTarget(el);
  assert.ok(t.target >= 150 && t.target <= 260, `만점 실측 170~202자에 맞아야 하는데 ${t.target}`);
});

test("양식 칸 크기가 있으면 그것만 말한다 — 분량 가이드와 두 숫자가 싸우지 않게 (2026-11-10 전수 확인)", () => {
  const guide = "머리기사: 제목 약 1줄, 내용 약 6줄. 인터뷰: 대상 1줄과 질문·답변 약 9줄. 사설/칼럼: 제목 1줄, 내용 약 6줄.";
  const elements = [
    { label: "머리기사", description: "주요 사건을 기사로 쓴다.", required_items: [] },
    { label: "인터뷰", description: "당시 사람을 인터뷰한 형식으로 쓴다.", required_items: [] },
    { label: "사설/칼럼", description: "주장과 근거를 쓴다.", required_items: [] },
  ];
  const ctx = {
    requirements: ["광복부터 정부 수립까지를 신문으로 만든다."],
    guide,
    labels: elements.map((e) => e.label),
    topic: "현대사 신문 만들기",
    siblings: elements.map((e) => ({ label: e.label, description: e.description })),
  };
  // 칸이 있는 단계는 분량 가이드 줄을 만들지 않는다(칸 블록이 이미 숫자를 말한다)
  const lines = lengthGuideLines(elements as never, ctx as never);
  assert.equal(lines.length, 0, `칸이 있는데도 분량 가이드가 나왔다: ${JSON.stringify(lines)}`);
  // 단계별 호출에 적어 줄 숫자도 칸에서 나온다 — 역할 표의 600자가 아니다
  const t = effectiveTarget(elements[0] as never, ctx as never);
  assert.ok(t !== null && t < 300, `칸(135~234자)이 아니라 역할 표를 따랐다: ${t}`);

  // 칸 크기를 모르는 과제는 예전대로 역할 표가 말한다
  const noGuide = { ...ctx, guide: undefined };
  assert.ok(lengthGuideLines(elements as never, noGuide as never).length > 0);
  assert.ok((effectiveTarget(elements[0] as never, noGuide as never) ?? 0) >= 300);
});

test("안내문이 '분량제한 X'라고 하면 칸 규칙이 꺼지고 역할 표가 말한다 (손글씨가 인쇄를 이긴다)", () => {
  const elements = [{ label: "머리기사", description: "기사를 쓴다.", required_items: [] }];
  const ctx = {
    requirements: ["분량 제한 없음(손글씨 안내)"],
    guide: "머리기사: 제목 약 1줄, 내용 약 6줄.",
    labels: ["머리기사"],
    topic: "현대사 신문 만들기",
    siblings: elements.map((e) => ({ label: e.label, description: e.description })),
  };
  assert.ok((effectiveTarget(elements[0] as never, ctx as never) ?? 0) >= 300);
  assert.ok(lengthGuideLines(elements as never, ctx as never).length > 0);
});

test("항목이 여럿인 개요는 바닥 400자가 아니다 (채점된 9회가 전부 1,157자 이상)", () => {
  const el = {
    label: "개요",
    description: "글의 목적·주제·예상 독자를 설정하고 중심 내용과 세부 내용을 구상하며 근거를 3가지 이상 모은다.",
    items_format: "sections",
    required_items: ["글의 목적·주제·예상 독자", "중심 내용과 세부 내용", "내용을 뒷받침하는 정보(근거) 3가지 이상", "출처"],
  };
  const p = planLength(el as never);
  assert.equal(p.role, "plan");
  // 만점 실행 1,390자가 범위 안에 들어야 한다
  assert.ok(p.min <= 1390 && p.max >= 1390, `만점 분량이 범위 밖이다: ${p.min}~${p.max}`);
  // 2026-10-29의 사고(2,000~2,700자 개요)를 되풀이하지 않는다
  assert.ok(p.max <= 1800, `상한이 너무 크다: ${p.max}`);
  // 항목이 적은 계획은 예전 그대로
  const small = planLength({ label: "실행 계획", description: "할 일을 적는다.", required_items: ["준비물"] } as never);
  assert.equal(small.min, 400);
});
