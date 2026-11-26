import { test } from "node:test";
import assert from "node:assert/strict";
import { narrowTarget, planLength, lengthGuideLines, lengthRoleOf, effectiveTarget } from "./length-plan.ts";

// ── 목표 하나로 좁히기 (LENGTH_TARGET) ─────────────────────
test("범위 대신 목표 하나 ±20%로 좁힌다", () => {
  const t = narrowTarget({ label: "스토리보드", description: "", required_items: ["화면", "대사"] });
  assert.equal(t.target, 1200); // general 800~1600의 중앙값(2026-11-16 상향, LENGTH_RAISE)
  assert.deepEqual([t.min, t.max], [960, 1440]);
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
  assert.equal(t.target, 715); // reflection 400+40n~900+90n의 중앙값(2026-11-16 상향)
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

test("칸 산출물은 항목 수가 아니라 칸 수로 분량을 잰다 (카드뉴스 목표가 3,450자로 부풀었다)", () => {
  // 분석이 칸마다 "시각 자료"+"간략한 글"로 펼쳐 항목이 15개가 된 실행
  const el = {
    label: "민주화 운동 카드뉴스",
    description: "책을 읽고 카드뉴스를 만든다.",
    items_format: "sections",
    required_items: [
      "책 제목", "카드 뉴스 제목", "전달하고자 하는 메시지",
      ...Array.from({ length: 6 }, (_, i) => [`${i + 1} 시각 자료`, `${i + 1} 간략한 글`]).flat(),
    ],
  };
  const ctx = {
    requirements: ["6개의 칸으로 구성된 카드뉴스를 만든다."],
    guide: "칸마다 시각 자료와 간략한 글을 넣는다.",
    labels: ["민주화 운동 카드뉴스"],
    topic: "민주화 운동 카드뉴스 만들기",
  };
  const p = planLength(el as never, ctx as never);
  // 채점된 실제: 1,466자 → 8/9, 1,960자 → 9/9, 2,585자 → 7/9. 만점이 범위 안이어야 한다.
  assert.ok(p.min <= 1960 && p.max >= 1960, `만점 분량이 범위 밖이다: ${p.min}~${p.max}`);
  // 항목 15개 × 160~300 = 2,400~4,500자였던 예전 공식으로 돌아가지 않았는지
  assert.ok(p.max <= 2600, `항목 수를 따라 부풀었다: ${p.max}`);
  // 설명이 장면 블록("칸마다 짧게")과 부딪치지 않는다
  assert.ok(!/항목당 대여섯 문장/.test(p.basis), `설명이 장면 블록과 반대다: ${p.basis}`);
});

// 2026-11-18: 손글씨 신호("부정행위 금지")가 안내문 전사에만 있어도 단계별 목표가 손으로 쓸 시간(1,350자)에 맞춰진다.
test("전사에만 있는 손글씨 신호도 단계 목표를 1,350자로 묶는다", () => {
  const el = { label: "논술", description: "논술형 글쓰기", required_items: ["a", "b", "c", "d", "e", "f", "g"] };
  const base = { requirements: [], guide: "", labels: ["논술"] };
  const without = effectiveTarget(el as never, base as never) ?? 0;
  const withNotice = effectiveTarget(el as never, { ...base, notice: "오픈북 테스트가 아니며, 부정행위 절대 금지" } as never) ?? 0;
  assert.ok(without > 1500, `신호 없이는 묶이지 않아야 한다: ${without}`);
  assert.ok(withNotice <= 1350, `전사 신호가 반영돼야 한다: ${withNotice}`);
});

// 2026-11-19 구조 점검: 단계마다 기본값을 더하면 총량이 단계 수에 비례한다 — 물리적 한계가 없는 단계들의 합은 총량 상한(3,500자)에 맞춘다.
test("물리적 한계가 없는 단계들의 합이 총량 상한을 넘으면 같은 비율로 줄인다", () => {
  const mk = (label: string) => ({ type: "text_submission", label, description: `${label}을 설명하는 글을 쓴다.`, required_items: ["가", "나", "다", "라", "마", "바"], items_format: "sections" as const });
  const els = [mk("분석 하나"), mk("분석 둘"), mk("분석 셋"), mk("분석 넷")];
  const ctx = { requirements: [], labels: els.map((e) => e.label), elements: els };
  const total = els.reduce((s, e) => { const p = planLength(e as never, ctx as never); return s + (p.min + p.max) / 2; }, 0);
  assert.ok(total <= 3600, `총량 상한 안이어야 한다: ${total}`);
  const alone = els.reduce((s, e) => { const p = planLength(e as never, { ...ctx, elements: undefined } as never); return s + (p.min + p.max) / 2; }, 0);
  assert.ok(alone > 4500, `상한 없이는 더 컸어야 한다(비교 기준): ${alone}`);
});

test("손으로 쓸 시간이 정해진 단계는 총량 상한으로 줄이지 않는다", () => {
  const els = [
    { type: "text_submission", label: "보고서", description: "보고서를 쓴다.", required_items: ["가", "나", "다", "라", "마", "바"], items_format: "sections" as const },
    { type: "text_submission", label: "편지", description: "편지를 쓴다.", required_items: [] },
  ];
  const notice = "1차시 보고서\n활동 내용 : 보고서를 씀.\n활동 시간 : 40분 쓰기\n\n2차시 편지\n활동 내용 : 편지 쓰기.\n활동 시간 : 30분간";
  const p = planLength(els[1] as never, { requirements: [], labels: ["보고서", "편지"], elements: els, notice } as never);
  assert.ok(p.basis.includes("손으로 쓸 시간"), p.basis);
  assert.ok(!p.basis.includes("총량 상한"), p.basis);
});

test("칸 하나에 짧게 답하는 단계(답안 칸·한 줄·자기 평가표)는 짧은 답으로 잰다", () => {
  const box = { label: "실험1 원리 설명", description: "원리를 설명한다.", required_items: [] };
  assert.equal(planLength(box as never, { requirements: ["각 활동의 빈 답안 칸에 제시된 원리를 설명할 것"], labels: ["실험1 원리 설명"] } as never).role, "short_answer");
  const line = { label: "이용 입장 정하기", description: "입장을 정해 양식의 한 줄에 작성한다.", required_items: [] };
  assert.equal(planLength(line as never, { requirements: [], labels: ["이용 입장 정하기"] } as never).role, "short_answer");
  const self = { label: "자기 평가", description: "자기 평가표의 각 항목을 1 / 2 / 3으로 평가하고 합계를 기록한다.", required_items: ["가", "나", "다", "라", "마"], items_format: "sections" as const };
  assert.equal(planLength(self as never, { requirements: [], labels: ["자기 평가"] } as never).role, "qa_list");
  const ox = { label: "탐구 확인 문제", description: "과학 윤리에 관한 문항은 ○ 또는 X로 표시하고, 옳은 것을 보기에서 고른다.", required_items: [] };
  assert.equal(planLength(ox as never, { requirements: [], labels: ["탐구 확인 문제"] } as never).role, "short_answer");
});

// 2026-11-20 역효과 점검(34종): 글 속 "표시한다"·안내문 어딘가의 "답안 칸" 때문에 회고록·실험 절차가 작은 답(300~500자)으로 분류됐다.
test("회고록·실험 절차는 작은 답이 아니다(표시 동작·다른 단계의 답안 칸에 속지 않는다)", () => {
  const memoir = { label: "회고록", description: "전시 동원 체제를 겪은 가상의 인물을 설정하고, 1950년을 현재 시점으로 표시한다. 과거를 회상하는 회고록을 쓴다.", required_items: [] };
  assert.notEqual(planLength(memoir as never, { requirements: [], labels: ["회고록"] } as never).role, "short_answer");
  // 안내문 다른 곳에 "답안 칸"이 있어도 회고록은 그대로 글이다.
  assert.notEqual(planLength(memoir as never, { requirements: ["문항 답은 답안 칸에 쓴다"], labels: ["회고록"] } as never).role, "short_answer");
  const lab = { label: "실험 1: 용액의 액성 판별하기", description: "A, B, C 스포이드에 표시하고 각 용액을 6홈판에 1mL씩 넣는다. 각 용액에 BTB 용액을 떨어뜨려 색을 관찰한다.", required_items: [] };
  assert.notEqual(planLength(lab as never, { requirements: [], labels: ["실험 1: 용액의 액성 판별하기"] } as never).role, "short_answer");
});

test("영어 결과물은 역할별 기본 분량을 2.5배로 키운다 — 한국어는 그대로(2026-11-27 영어 UI 논증 에세이가 한국어 상한에 갇힘)", () => {
  const el = { label: "논증 에세이", description: "주장과 근거를 갖춘 논증 에세이를 작성한다." };
  const ko = planLength(el);
  const en = planLength(el, { english: true });
  assert.equal(en.min, Math.round(ko.min * 2.5));
  assert.equal(en.max, Math.round(ko.max * 2.5));
  process.env.ENGLISH_PLAN_SCALE = "off";
  try {
    assert.equal(planLength(el, { english: true }).max, ko.max);
  } finally {
    delete process.env.ENGLISH_PLAN_SCALE;
  }
});
