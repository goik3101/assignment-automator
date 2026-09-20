import { getServiceClient } from "@/lib/supabase/service-client";
import { canonicalKeyFromLegacy } from "@/lib/selection/canonical";
import type { HistoryEntry } from "@/lib/selection/score";

// ============================================================================
// 추천 이력(recommendation_history) 저장/조회 + 프롬프트용 안내문.
//
// ⚠️ src/lib/clusters/(M2/M3)와 이름이 비슷하지만 다른 축이다:
//   - clusters/task_embeddings = "안내문 임베딩" 기반, 결과물 전체가 의미적으로 비슷한지(embedForClustering/embedForDiversity).
//   - 이 모듈 = "같은 책/인물/주제가 반복 선정되는지" — 임베딩을 쓰지 않는다. 절대 섞지 말 것.
//
// 2026-09-21 개편(전수 조사 결과 반영): 중복 방지의 실제 계산은 src/lib/selection/(코드 레벨 점수·선택)이 맡고,
// 이 모듈은 이력 I/O와 "같은 수행평가(cluster_id) 범위의 안내문"만 만든다. 이전처럼 전체 기록 상위 N개를 모든 과제에
// 공통으로 넣지 않는다(다른 과제의 항목이 섞이던 문제).
//
// DB 접근 실패(마이그레이션 미적용 등)가 핵심 생성 파이프라인을 막으면 안 된다 — 모든 함수는 실패 시
// 조용히 안전한 기본값으로 넘어가고 콘솔에만 남긴다.
// ============================================================================

export type RecommendationCategory = "book" | "statistic" | "case_example" | "subject";

export interface RecommendationRecord {
  itemName: string;
  createdAt: string;
  userId: string | null;
  clusterId: string | null;
  displayName: string | null;
  semanticGroup: string | null;
  isTest: boolean;
}

export interface RecordRecommendationInput {
  category: RecommendationCategory;
  /** 중복 판정용 canonical key(표시 이름이 아님). */
  itemName: string;
  displayName?: string | null;
  semanticGroup?: string | null;
  /** 테스트 실행 표시 — 실제 추천 통계에서 제외된다(0015 이후). */
  isTest?: boolean;
  userId?: string | null;
  guestId?: string | null;
  clusterId?: string | null;
  topic?: string | null;
  source?: string | null;
  submissionId?: string | null;
}

function isMissingColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === "42703" || err.code === "PGRST204" || /column .* (does not exist|of relation)|Could not find the '.*' column/i.test(err.message ?? "");
}

/** 추천이 확정된 시점에 이력을 남긴다. 실패해도 생성 파이프라인을 막지 않는다. */
export async function recordRecommendation(input: RecordRecommendationInput): Promise<void> {
  try {
    const supabase = getServiceClient();
    const base = {
      category: input.category,
      item_name: input.itemName,
      user_id: input.userId ?? null,
      guest_id: input.guestId ?? null,
      cluster_id: input.clusterId ?? null,
      topic: input.topic ?? null,
      source: input.source ?? null,
      submission_id: input.submissionId ?? null,
    };
    const { error } = await supabase.from("recommendation_history").insert({
      ...base,
      display_name: input.displayName ?? null,
      semantic_group: input.semanticGroup ?? null,
      is_test: input.isTest === true,
    });
    if (!error) return;
    if (isMissingColumnError(error)) {
      // 0015 미적용 — 예전 컬럼만으로 기록한다(테스트 표시는 못 남기므로 테스트 실행은 기록하지 않는다).
      if (input.isTest) return;
      const { error: legacyError } = await supabase.from("recommendation_history").insert(base);
      if (legacyError) console.error("[recommendation-diversity] 이력 기록 실패(legacy)", legacyError);
      return;
    }
    console.error("[recommendation-diversity] 이력 기록 실패", error);
  } catch (err) {
    console.error("[recommendation-diversity] 이력 기록 중 예외", err);
  }
}

export interface QueryRecommendationsOptions {
  /** 최근 N일 이내만(기본 90일). */
  sinceDays?: number;
  limitCount?: number;
  /** 있으면 그 사용자 것만. */
  userId?: string;
  /** 있으면 그 수행평가(cluster_id) 것만. */
  clusterId?: string;
  /** 테스트 행 포함 여부(기본 false — 실제 통계에서 제외). */
  includeTest?: boolean;
}

/** 원시 조회 프리미티브. select("*")라 0015 컬럼이 없어도 동작한다(없으면 null/false). */
export async function queryRecommendations(
  category: RecommendationCategory,
  opts: QueryRecommendationsOptions = {}
): Promise<RecommendationRecord[]> {
  const { sinceDays = 90, limitCount = 500, userId, clusterId, includeTest = false } = opts;
  try {
    const supabase = getServiceClient();
    const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
    let query = supabase
      .from("recommendation_history")
      .select("*")
      .eq("category", category)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(limitCount);
    if (userId) query = query.eq("user_id", userId);
    if (clusterId) query = query.eq("cluster_id", clusterId);

    const { data, error } = await query;
    if (error) {
      console.error("[recommendation-diversity] 이력 조회 실패", error);
      return [];
    }
    return (data ?? [])
      .map((row) => {
        const r = row as Record<string, unknown>;
        return {
          itemName: r.item_name as string,
          createdAt: r.created_at as string,
          userId: (r.user_id as string | null) ?? null,
          clusterId: (r.cluster_id as string | null) ?? null,
          displayName: (r.display_name as string | null) ?? null,
          semanticGroup: (r.semantic_group as string | null) ?? null,
          isTest: r.is_test === true,
        };
      })
      .filter((r) => includeTest || !r.isTest);
  } catch (err) {
    console.error("[recommendation-diversity] 이력 조회 중 예외", err);
    return [];
  }
}

/** 선정 점수 계산용 이력. 예전 방식 item_name도 canonical key로 승격해서 같은 대상끼리 합쳐 센다. */
export async function loadSelectionHistory(
  category: RecommendationCategory,
  opts: { sinceDays?: number } = {}
): Promise<HistoryEntry[]> {
  const rows = await queryRecommendations(category, { sinceDays: opts.sinceDays ?? 90 });
  return rows.map((r) => ({
    key: category === "subject" ? canonicalKeyFromLegacy(r.itemName) : r.itemName,
    name: r.displayName ?? r.itemName,
    group: r.semanticGroup,
    userId: r.userId,
    scopeKey: r.clusterId,
    createdAt: r.createdAt,
    isTest: r.isTest,
  }));
}

/** 순수 JS 집계. */
export function summarizeItemFrequency(records: { itemName: string }[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const r of records) freq.set(r.itemName, (freq.get(r.itemName) ?? 0) + 1);
  return freq;
}

export interface RecommendationGuidance {
  instructionText: string;
  scopeFrequency: Map<string, number>;
}

const GUIDANCE_MIN_HISTORY = Number(process.env.RECOMMENDATION_GUIDANCE_MIN_HISTORY ?? 3);
const GUIDANCE_TOP_N = Number(process.env.RECOMMENDATION_GUIDANCE_TOP_N ?? 5);

/**
 * "같은 수행평가(scopeKey)"에서 최근 많이 선정된 항목만 알려주는 보조 안내문. 이제 이 안내문은 참고용 힌트일 뿐이고
 * (프롬프트만으로는 지켜지지 않는다는 게 실측으로 확인됨), 실제 회피는 src/lib/selection/의 코드 선택이 한다.
 * scopeKey가 없으면 null — 다른 과제의 기록을 절대 섞지 않는다.
 */
export async function buildRecommendationGuidance(
  category: RecommendationCategory,
  opts: { scopeKey?: string | null; sinceDays?: number } = {}
): Promise<RecommendationGuidance | null> {
  if (!opts.scopeKey) return null;
  const records = await queryRecommendations(category, { sinceDays: opts.sinceDays, clusterId: opts.scopeKey });
  if (records.length < GUIDANCE_MIN_HISTORY) return null;

  const names = new Map<string, string>();
  const freq = new Map<string, number>();
  for (const r of records) {
    const key = category === "subject" ? canonicalKeyFromLegacy(r.itemName) : r.itemName;
    freq.set(key, (freq.get(key) ?? 0) + 1);
    if (!names.has(key)) names.set(key, r.displayName ?? r.itemName);
  }
  const minCount = category === "statistic" || category === "case_example" ? 2 : 1;
  const top = [...freq.entries()]
    .filter(([, c]) => c >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, GUIDANCE_TOP_N)
    .map(([k, c]) => `${names.get(k)}(최근 ${c}회)`);
  if (top.length === 0) return null;
  const label = category === "book" ? "책" : category === "statistic" ? "통계/자료" : category === "subject" ? "인물/대상" : "사례";
  const instructionText = `
[선정 다양성 참고 — 이 수행평가에서 최근 다른 학생들이 자주 고른 ${label}]
${top.join(", ")}.
가능하면 이 항목들과 겹치지 않는 대안을 우선 고려하되, 과제 조건에 맞지 않는 항목으로 바꾸지는 말 것.
`.trim();
  return { instructionText, scopeFrequency: freq };
}
