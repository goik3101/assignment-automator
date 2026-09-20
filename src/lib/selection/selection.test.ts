import test from "node:test";
import assert from "node:assert/strict";
import { canonicalize, canonicalKeyFromLegacy, sameEntity, sameSemanticGroup } from "./canonical.ts";
import { selectFromCandidates, scoreCandidates, type HistoryEntry, type SelectionCandidate } from "./score.ts";

const cand = (name: string, fit = 0.9, group?: string): SelectionCandidate => ({ ...canonicalize(name), name, fit, group });
const now = Date.parse("2026-09-20T00:00:00Z");
const h = (key: string, o: Partial<HistoryEntry> = {}): HistoryEntry => ({ key, createdAt: "2026-09-19T00:00:00Z", scopeKey: "S1", userId: "u1", ...o });
// 재현 가능한 난수(mulberry32)
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("별칭: 표기가 다른 같은 인물은 같은 key, 다른 인물은 다른 key", () => {
  const mlk = ["마틴 루터 킹", "마틴 루서 킹 주니어", "마틴루터킹주니어", "Martin Luther King Jr.", "마틴 루서 킹 Jr."].map((n) => canonicalize(n).key);
  assert.equal(new Set(mlk).size, 1);
  assert.equal(canonicalize("앙리 뒤낭").key, canonicalize("장 앙리 뒤낭").key);
  assert.equal(canonicalize("앙리 뒤낭(Henry Dunant)").key, "henry_dunant");
  assert.notEqual(canonicalize("김구").key, canonicalize("김구라").key);
  assert.equal(canonicalize("아무개", "Some New Person").key, "some_new_person");
});

test("별칭: 예전 방식 item_name(공백 제거)도 canonical key로 승격된다", () => {
  assert.equal(canonicalKeyFromLegacy("마틴루서킹주니어"), "martin_luther_king_jr");
  assert.equal(canonicalKeyFromLegacy("소파방정환"), "bang_jeong_hwan");
  assert.equal(canonicalKeyFromLegacy("전혀모르는대상"), "전혀모르는대상");
});

test("sameEntity: 짧은 이름끼리 포함 관계만으로 합치지 않는다", () => {
  assert.equal(sameEntity("김구", "김구라"), false);
  assert.equal(sameEntity("마틴루터킹", "마틴루터킹주니어"), true);
});

test("의미 그룹: 베르누이/양력/날개는 같은 계열, 스마트폰과 베르누이는 다른 계열", () => {
  assert.equal(sameSemanticGroup({ name: "베르누이 정리" }, { name: "비행기 날개의 양력 원리" }), true);
  assert.equal(sameSemanticGroup({ name: "베르누이 원리" }, { name: "샤워커튼 현상" }), true);
  assert.equal(sameSemanticGroup({ name: "스마트폰 과의존" }, { name: "베르누이 정리" }), false);
  assert.equal(sameSemanticGroup({ name: "가" , group: "고체 물리 실험"}, { name: "나", group: "고체 물리 실험" }), true);
});

test("같은 사용자가 같은 수행평가에서 최근 쓴 대상은 1차 후보에서 제외된다", () => {
  const c = [cand("앙리 뒤낭"), cand("넬슨 만델라"), cand("전태일")];
  const hist = [h("henry_dunant"), h("henry_dunant", { createdAt: "2026-09-18T00:00:00Z" })];
  for (let i = 0; i < 50; i++) {
    const r = selectFromCandidates(c, hist, { userId: "u1", scopeKey: "S1", now, rng: rng(i) })!;
    assert.notEqual(r.picked.key, "henry_dunant");
    assert.equal(r.tier, "strict");
  }
});

test("다른 수행평가(scope)·테스트 행의 기록은 점수에 영향이 없다", () => {
  const c = [cand("앙리 뒤낭"), cand("넬슨 만델라")];
  const hist = [h("henry_dunant", { scopeKey: "OTHER" }), h("henry_dunant", { isTest: true })];
  const s = scoreCandidates(c, hist, { userId: "u1", scopeKey: "S1", now });
  assert.equal(s[0].penalty, 0);
  assert.equal(s[0].userRecent, false);
});

test("다른 사용자의 기록은 전체 점유율에만 약하게 반영되고 그 사용자의 '최근 사용'으로 취급되지 않는다", () => {
  const c = [cand("앙리 뒤낭"), cand("넬슨 만델라")];
  const hist = [h("henry_dunant", { userId: "uA" })];
  const s = scoreCandidates(c, hist, { userId: "uB", scopeKey: "S1", now });
  const dunant = s.find((x) => x.key === "henry_dunant")!;
  assert.equal(dunant.userRecent, false);
  assert.equal(dunant.userWeight, 0);
  assert.ok(dunant.scopeShare > 0);
  assert.ok(dunant.penalty > 0 && dunant.penalty < 1, `약한 페널티여야 함: ${dunant.penalty}`);
});

test("후보가 전부 최근 사용이면 명시적 fallback(fallbackUsed)으로 최고 점수 후보를 허용한다", () => {
  const c = [cand("앙리 뒤낭", 0.95), cand("넬슨 만델라", 0.7)];
  const hist = [h("henry_dunant"), h("nelson_mandela")];
  const r = selectFromCandidates(c, hist, { userId: "u1", scopeKey: "S1", now })!;
  assert.equal(r.tier, "fallback");
  assert.equal(r.fallbackUsed, true);
});

test("fit 하한 미만 후보는 다양성 때문에 뽑히지 않는다(적합 후보가 있는 한)", () => {
  const c = [cand("앙리 뒤낭", 0.9), cand("엉뚱한 후보", 0.2)];
  const hist = [h("henry_dunant", { userId: "other" }), h("henry_dunant", { userId: "other2" }), h("henry_dunant", { userId: "other3" })];
  for (let i = 0; i < 30; i++) {
    const r = selectFromCandidates(c, hist, { userId: "u1", scopeKey: "S1", now, rng: rng(i) })!;
    assert.equal(r.picked.key, "henry_dunant");
  }
});

test("분포: 이력이 쌓일수록 한 명에게 몰리지 않는다(시뮬레이션 200회)", () => {
  const pool = ["앙리 뒤낭", "넬슨 만델라", "전태일", "마하트마 간디", "엘리너 루스벨트", "말랄라 유사프자이", "로자 파크스", "김구"].map((n) => cand(n, 0.9));
  const hist: HistoryEntry[] = [];
  const counts = new Map<string, number>();
  const rand = rng(7);
  for (let i = 0; i < 200; i++) {
    const uid = `u${i % 10}`;
    const r = selectFromCandidates(pool, hist, { userId: uid, scopeKey: "S1", now, rng: rand })!;
    counts.set(r.picked.key, (counts.get(r.picked.key) ?? 0) + 1);
    hist.push({ key: r.picked.key, userId: uid, scopeKey: "S1", createdAt: "2026-09-19T00:00:00Z" });
  }
  const top = Math.max(...counts.values());
  assert.ok(counts.size >= 7, `고유 ${counts.size}`);
  assert.ok(top / 200 <= 0.25, `최다 비율 ${top / 200}`);
});

test("후보가 없으면 null", () => {
  assert.equal(selectFromCandidates([], [], {}), null);
});
