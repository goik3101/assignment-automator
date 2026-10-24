import { test } from "node:test";
import assert from "node:assert/strict";
import { limitSources, requiredSourceCount } from "./source-select.ts";
import { lengthGuideLines, lengthRoleOf, planLength } from "./length-plan.ts";
import { buildFormRulesBlock, inferFormKinds } from "./form-rules.ts";

const NL = String.fromCharCode(10);
const LONG = (s: string) => s + " filler".repeat(60);

// ── 출처 수 ───────────────────────────────────────────────
test("안내문이 요구한 출처 수를 읽는다", () => {
  assert.equal(requiredSourceCount(["참고 문헌 5개 이상 포함"]), 5);
  assert.equal(requiredSourceCount(["출처를 3개 이상 제시한다"]), 3);
  assert.equal(requiredSourceCount(["자료를 조사하여 쓴다"]), null);
});

test("출처가 한도 이하면 쓰지 않은 출처만 빼고 번호를 이어 붙인다", () => {
  const r = limitSources(["가나다.[3]", "라마바.[3][5]"], [{ n: 1 }, { n: 3 }, { n: 5 }], 3);
  assert.deepEqual(r.sources.map((s) => s.n), [1, 2]);
  assert.deepEqual(r.contents, ["가나다.[1]", "라마바.[1][2]"]);
});

test("출처가 많으면 많이 쓰이고 신뢰도 높은 출처로 모으되, 대체할 수 없는 문장은 원래 출처를 살린다", () => {
  const lines = [
    "1997년에 태어났다.[1]",
    "1997년 출생이 기록돼 있다.[2]",
    "2014년 노벨상을 받았다.[3]",
    "2014년 수상이 발표됐다.[4]",
    "2013년 재단을 세웠다.[5]",
    "2013년 재단 설립 보고서가 있다.[3]",
  ].join(NL);
  const sources = [
    { n: 1, tier: "reference" as const },
    { n: 2, tier: "general" as const },
    { n: 3, tier: "official" as const },
    { n: 4, tier: "general" as const },
    { n: 5, tier: "general" as const },
  ];
  const pages = new Map<number, string | null>([
    [1, LONG("born in 1997 Mingora")],
    [2, LONG("recorded 1997 birth")],
    [3, LONG("Nobel Peace Prize 2014 announced; foundation 2013 established")],
    [4, LONG("2014 announced")],
    [5, LONG("2013 founded")],
  ]);
  const r = limitSources([lines], sources, 2, pages);
  assert.ok(r.sources.length <= 4, "최대 limit+2");
  assert.ok(r.sources.length >= 2);
  // 번호는 1부터 연속이고 본문의 모든 각주가 새 출처 목록 안에 있다
  const ns = new Set(r.sources.map((s) => s.n));
  for (const m of r.contents[0].matchAll(/\[(\d+)\]/g)) assert.ok(ns.has(Number(m[1])), "새 번호 " + m[1]);
  assert.deepEqual([...ns].sort(), r.sources.map((_, i) => i + 1));
  // 출처가 가장 신뢰도 높고 두 번 쓰인 3번은 남는다
  assert.ok(r.sources.some((s) => s.tier === "official"));
});

// ── 분량 ─────────────────────────────────────────────────
test("단계 역할마다 다른 분량을 계획한다(같은 숫자를 모든 단계에 주지 않는다)", () => {
  const els = [
    { label: "자료 수집", description: "인물 조사", items_format: "sections" as const, required_items: ["배경", "활동", "성과", "영향", "선정 이유"] },
    { label: "신문 제작", description: "신문 제작", items_format: "flowing" as const, required_items: ["배경", "활동", "시각 자료", "교훈"] },
    { label: "제작 소감", description: "느낀 점" },
    { label: "포스터 문구", description: "슬로건" },
    { label: "영어 발표 대본", description: "발표" },
  ];
  assert.deepEqual(els.map((e) => lengthRoleOf(e)), ["material", "newspaper", "reflection", "slogan", "script"]);
  const plans = els.map((e) => planLength(e));
  assert.ok(plans[0].max > plans[2].max, "조사 자료 > 소감");
  assert.ok(plans[3].max < plans[2].max, "슬로건 < 소감");
  const guide = lengthGuideLines(els.map((e, i) => (i === 4 ? { ...e, target_length: { min: 150, max: 200 } } : e)));
  assert.equal(guide.length, 4, "안내문에 분량이 있는 단계는 가이드에서 뺀다");
});

// ── 유형별 규칙 ───────────────────────────────────────────
test("유형 규칙은 필요한 곳에만 붙고 신문은 제외된다", () => {
  assert.deepEqual(inferFormKinds({ label: "신문 제작", description: "신문을 만든다" }), []);
  assert.ok(inferFormKinds({ label: "영어 발표 대본", description: "발표" }).includes("speech"));
  assert.ok(inferFormKinds({ label: "탐구 보고서", description: "가설과 변인을 설정한 실험 설계" }).includes("experiment"));
  assert.deepEqual(inferFormKinds({ label: "제작 소감", description: "" }), ["reflection"]);
  // 청중기록지는 기록지 규칙 하나만(발표를 지어내지 않게) — 설명에 "발표"가 있어도 발표 대본 규칙을 섞지 않는다.
  assert.deepEqual(inferFormKinds({ label: "청중기록지", description: "친구들의 발표를 듣고 평가한다" }), ["observation_record"]);
  assert.deepEqual(inferFormKinds({ label: "매체 활용 발표", description: "발표 대본" }).includes("observation_record"), false);
  const creative = inferFormKinds({ label: "짧은 소설", description: "창작 보고서 형식이 아님" });
  assert.deepEqual(creative, ["creative"]);
  assert.equal(buildFormRulesBlock([{ label: "자료 수집", description: "조사" }]), "");
  assert.match(buildFormRulesBlock([{ label: "토론 입론서", description: "찬반 토론" }]), /"토론 입론서" 단계: 입장을 먼저/);
});
