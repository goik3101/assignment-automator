import { sameEntity, sameSemanticGroup } from "./canonical.ts";

// 자동 선정 공통 점수/선택 로직 — 순수 함수(DB·LLM 호출 없음)라 fixture 이력으로 그대로 테스트한다.
//
// 우선순위(사용자 요구): 1) 조건 충족 2) 검증 가능성 3) 관련성 4) 교육적 적절성 → 이건 후보 생성·검증 단계와 fit 점수가 맡고,
// 5) 최근 반복 회피 6) 전체 다양성 → 여기서 fit에서 페널티를 빼는 방식으로 반영한다. 부적합 후보를 다양성 때문에 올리지 않는다
// (fit 하한 미만 후보는 애초에 고르지 않는다).

export interface SelectionCandidate {
  /** 화면·프롬프트에 쓰는 이름. */
  name: string;
  /** canonicalize()가 만든 중복 판정용 키. */
  key: string;
  /** 같은 탐구 계열 라벨(선택). */
  group?: string | null;
  /** 과제 적합도 0~1 (모델이 준 1~5를 정규화). */
  fit: number;
}

export interface HistoryEntry {
  key: string;
  name?: string;
  group?: string | null;
  userId?: string | null;
  /** 같은 수행평가(클러스터) 식별자. */
  scopeKey?: string | null;
  createdAt: string;
  isTest?: boolean;
}

export interface SelectionConfig {
  /** 최근성 반감기(일). */
  halfLifeDays: number;
  /** 같은 사용자 + 같은 수행평가에서 이 횟수 이내로 최근에 쓴 대상은 1차 후보에서 제외. */
  userRecentN: number;
  /** 같은 수행평가 전체에서 이 점유율 이상이면 "과다 사용"으로 보고 1차 후보에서 제외. */
  overusedShare: number;
  /** fit 하한 — 이보다 낮은 후보는 다양성 때문에 올라오지 않는다. */
  minFit: number;
  /** 소프트맥스 온도(높을수록 무작위성↑). */
  temperature: number;
  weights: { user: number; scope: number; group: number; crossScope: number };
  /** 라플라스 스무딩(이력이 적을 때 점유율이 튀지 않게 — avoidance.ts와 같은 발상). */
  smoothingK: number;
}

export const DEFAULT_SELECTION_CONFIG: SelectionConfig = {
  halfLifeDays: 30,
  userRecentN: 3,
  overusedShare: 0.2,
  minFit: 0.5,
  temperature: 0.5,
  weights: { user: 1.0, scope: 1.4, group: 0.6, crossScope: 0 },
  smoothingK: 4,
};

export interface SelectionContext {
  userId?: string | null;
  scopeKey?: string | null;
  now?: number;
  /** 같은 카테고리의 다른 수행평가 기록까지 약하게 반영할 때만 crossScope 가중치를 올린다(책처럼 과제와 무관하게 몇 권으로 수렴하는 경우). */
  config?: Partial<SelectionConfig>;
  /** 테스트에서 결과를 재현하려고 넣는 난수 함수. */
  rng?: () => number;
}

export interface ScoredCandidate extends SelectionCandidate {
  userWeight: number;
  scopeShare: number;
  groupShare: number;
  crossShare: number;
  penalty: number;
  score: number;
  userRecent: boolean;
}

export type SelectionTier = "strict" | "relaxed" | "fallback";

export interface SelectionResult {
  picked: ScoredCandidate;
  tier: SelectionTier;
  ranking: ScoredCandidate[];
  /** 1차(엄격) 조건으로는 고를 후보가 없어 완화/폴백을 썼는가 — 호출부가 로그에 남긴다. */
  fallbackUsed: boolean;
}

const DAY = 86400_000;

function decay(createdAt: string, now: number, halfLife: number): number {
  const age = Math.max(0, (now - new Date(createdAt).getTime()) / DAY);
  return Math.pow(0.5, age / halfLife);
}

export function scoreCandidates(
  candidates: SelectionCandidate[],
  history: HistoryEntry[],
  ctx: SelectionContext = {}
): ScoredCandidate[] {
  const cfg: SelectionConfig = { ...DEFAULT_SELECTION_CONFIG, ...ctx.config, weights: { ...DEFAULT_SELECTION_CONFIG.weights, ...ctx.config?.weights } };
  const now = ctx.now ?? Date.now();
  const real = history.filter((h) => !h.isTest);
  const inScope = real.filter((h) => (ctx.scopeKey ? h.scopeKey === ctx.scopeKey : false));
  const outScope = real.filter((h) => !ctx.scopeKey || h.scopeKey !== ctx.scopeKey);

  const w = (h: HistoryEntry) => decay(h.createdAt, now, cfg.halfLifeDays);
  const scopeTotal = inScope.reduce((s, h) => s + w(h), 0);
  const crossTotal = outScope.reduce((s, h) => s + w(h), 0);

  // 같은 사용자 + 같은 수행평가의 최근 N개 키
  const userRecentKeys = ctx.userId
    ? inScope
        .filter((h) => h.userId === ctx.userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, cfg.userRecentN)
        .map((h) => h.key)
    : [];

  return candidates.map((c) => {
    const same = (h: HistoryEntry) => sameEntity(h.key, c.key);
    const sem = (h: HistoryEntry) => sameSemanticGroup({ name: c.name, group: c.group }, { name: h.name ?? h.key, group: h.group });

    const userWeight = ctx.userId ? inScope.filter((h) => h.userId === ctx.userId && same(h)).reduce((s, h) => s + w(h), 0) : 0;
    const scopeWeight = inScope.filter(same).reduce((s, h) => s + w(h), 0);
    const groupWeight = inScope.filter((h) => !same(h) && sem(h)).reduce((s, h) => s + w(h), 0);
    const crossWeight = outScope.filter(same).reduce((s, h) => s + w(h), 0);

    const scopeShare = scopeWeight / (scopeTotal + cfg.smoothingK);
    const groupShare = groupWeight / (scopeTotal + cfg.smoothingK);
    const crossShare = crossWeight / (crossTotal + cfg.smoothingK);
    const penalty =
      cfg.weights.user * Math.min(1, userWeight) +
      cfg.weights.scope * scopeShare * 3 +
      cfg.weights.group * groupShare * 3 +
      cfg.weights.crossScope * crossShare * 3;

    return {
      ...c,
      userWeight,
      scopeShare,
      groupShare,
      crossShare,
      penalty,
      score: c.fit - penalty,
      userRecent: userRecentKeys.some((k) => sameEntity(k, c.key)),
    };
  });
}

function weightedPick(pool: ScoredCandidate[], temperature: number, rng: () => number): ScoredCandidate {
  const max = Math.max(...pool.map((c) => c.score));
  const weights = pool.map((c) => Math.exp((c.score - max) / temperature));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * 후보 중 하나를 고른다. 3단계 fallback:
 *  strict  — fit 하한 통과 + 같은 사용자 최근 사용 아님 + 과다 사용(점유율) 아님
 *  relaxed — fit 하한 통과 + 같은 사용자 최근 사용 아님 (점유율 페널티는 점수에만 반영)
 *  fallback — fit 하한 통과 후보 전부(최근 사용 허용, 점수 최고 우선). 그래도 없으면 fit이 가장 높은 후보.
 */
export function selectFromCandidates(
  candidates: SelectionCandidate[],
  history: HistoryEntry[],
  ctx: SelectionContext = {}
): SelectionResult | null {
  if (candidates.length === 0) return null;
  const cfg: SelectionConfig = { ...DEFAULT_SELECTION_CONFIG, ...ctx.config, weights: { ...DEFAULT_SELECTION_CONFIG.weights, ...ctx.config?.weights } };
  const rng = ctx.rng ?? Math.random;
  const ranking = scoreCandidates(candidates, history, ctx).sort((a, b) => b.score - a.score);

  const fitOk = ranking.filter((c) => c.fit >= cfg.minFit);
  const strict = fitOk.filter((c) => !c.userRecent && c.scopeShare < cfg.overusedShare);
  if (strict.length > 0) return { picked: weightedPick(strict, cfg.temperature, rng), tier: "strict", ranking, fallbackUsed: false };

  const relaxed = fitOk.filter((c) => !c.userRecent);
  if (relaxed.length > 0) return { picked: weightedPick(relaxed, cfg.temperature, rng), tier: "relaxed", ranking, fallbackUsed: true };

  if (fitOk.length > 0) return { picked: fitOk[0], tier: "fallback", ranking, fallbackUsed: true };
  const best = [...ranking].sort((a, b) => b.fit - a.fit)[0];
  return { picked: best, tier: "fallback", ranking, fallbackUsed: true };
}
