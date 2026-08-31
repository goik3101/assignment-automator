import { getServiceClient } from "@/lib/supabase/service-client";

// ============================================================================
// 추천 다양성 시스템 — 실제로 발견된 버그: 서로 다른 주제("진로 고민", "친구가
// 없어 느끼는 고립감")에 연속으로 헤르만 헤세의 『데미안』이 추천됨. 검증
// (grounding)하기 쉬운 소수의 유명한 항목으로 추천이 수렴하는 구조적 편향으로
// 추정된다. 이 모듈의 목적은 특정 항목을 금지하는 게 아니라, "최근에 이 항목이
// 얼마나 자주 추천됐는지"를 추적해서 생성 프롬프트에 반영할 수 있게 하는 것 —
// 책/통계/사례 등 여러 추천 기능이 공유해서 쓴다.
//
// ⚠️ 이 모듈은 src/lib/clusters/(M2/M3, avoidance.ts·identify-cluster.ts·
// save-result-embedding.ts)와 이름이 비슷해 보이지만 완전히 다른 축이다:
//   - clusters/task_embeddings = "안내문(과제) 임베딩" 기반 클러스터당 "결과물
//     전체"가 의미적으로 비슷한지(embedForClustering/embedForDiversity 사용).
//   - 이 모듈(recommendation_history) = "똑같은 책 제목/통계/사례가 문자
//     그대로 반복되는지" — 임베딩을 전혀 쓰지 않는다.
// 함수명에 "diversity"만 단독으로 쓰지 않고 recommendation/item 접두어를
// 붙인 것도 이 구분을 명확히 하기 위함이다. 절대 이 둘을 같은 값으로 섞지 말 것.
//
// DB 접근 실패(가장 흔하게는 마이그레이션을 아직 안 돌린 경우)가 핵심 생성
// 파이프라인을 절대 막으면 안 된다 — validate-sources.ts의 logValidations()와
// 같은 이유로, 여기 모든 함수는 실패 시 조용히 안전한 기본값(빈 배열/null)으로
// 넘어가고 콘솔에만 경고를 남긴다.
// ============================================================================

export type RecommendationCategory = "book" | "statistic" | "case_example";

export interface RecommendationRecord {
  itemName: string;
  createdAt: string;
  userId: string | null;
}

export interface RecordRecommendationInput {
  category: RecommendationCategory;
  itemName: string;
  userId?: string | null;
  guestId?: string | null;
  clusterId?: string | null;
  topic?: string | null;
  source?: string | null;
  submissionId?: string | null;
}

/** 추천이 확정된 시점에 이력을 남긴다. 실패해도 생성 파이프라인을 막지 않는다. */
export async function recordRecommendation(input: RecordRecommendationInput): Promise<void> {
  try {
    const supabase = getServiceClient();
    const { error } = await supabase.from("recommendation_history").insert({
      category: input.category,
      item_name: input.itemName,
      user_id: input.userId ?? null,
      guest_id: input.guestId ?? null,
      cluster_id: input.clusterId ?? null,
      topic: input.topic ?? null,
      source: input.source ?? null,
      submission_id: input.submissionId ?? null,
    });
    if (error) console.error("[recommendation-diversity] 이력 기록 실패", error);
  } catch (err) {
    console.error("[recommendation-diversity] 이력 기록 중 예외", err);
  }
}

export interface QueryRecommendationsOptions {
  /** 최근 N일 이내만(기본 90일). */
  sinceDays?: number;
  /** 최대 건수(기본 200 — 이 규모에서는 실시간 조회 후 JS 집계로 충분하다,
   * avoidance.ts의 "트래픽 커지면 캐시+배치로 전환" 철학과 동일). */
  limitCount?: number;
  /** 있으면 그 사용자 것만(개인별 중복 회피용). 없으면 전체 사용자(전체 회피용). */
  userId?: string;
}

/** 원시 조회 프리미티브 — "최근 N건"/"최근 N일"/"개인별"/"전체"를 전부 이걸로 커버한다. */
export async function queryRecommendations(
  category: RecommendationCategory,
  opts: QueryRecommendationsOptions = {}
): Promise<RecommendationRecord[]> {
  const { sinceDays = 90, limitCount = 200, userId } = opts;
  try {
    const supabase = getServiceClient();
    const sinceIso = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
    let query = supabase
      .from("recommendation_history")
      .select("item_name, created_at, user_id")
      .eq("category", category)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(limitCount);
    if (userId) query = query.eq("user_id", userId);

    const { data, error } = await query;
    if (error) {
      console.error("[recommendation-diversity] 이력 조회 실패", error);
      return [];
    }
    return (data ?? []).map((row) => ({
      itemName: (row as { item_name: string }).item_name,
      createdAt: (row as { created_at: string }).created_at,
      userId: (row as { user_id: string | null }).user_id,
    }));
  } catch (err) {
    console.error("[recommendation-diversity] 이력 조회 중 예외", err);
    return [];
  }
}

/** 순수 JS 집계 — DB 왕복 없이 "항목별 추천 횟수"/"최근 추천 항목 목록"을 파생한다. */
export function summarizeItemFrequency(records: RecommendationRecord[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const r of records) {
    freq.set(r.itemName, (freq.get(r.itemName) ?? 0) + 1);
  }
  return freq;
}

export interface RecommendationGuidance {
  /** 프롬프트에 바로 넣을 안내 텍스트. */
  instructionText: string;
  /** 진단/테스트용 — 실제로 참고한 빈도 데이터. */
  recentGlobalFrequency: Map<string, number>;
  recentUserFrequency: Map<string, number>;
}

const GUIDANCE_MIN_HISTORY = Number(process.env.RECOMMENDATION_GUIDANCE_MIN_HISTORY ?? 3);
// 안내문에 실제로 나열할 "최근 과다 사용 항목" 개수 상한 — 프롬프트가 너무 길어지지
// 않게, 빈도 상위 몇 개만 예시로 보여준다(전체 금지 목록이 아니라 예시일 뿐).
const GUIDANCE_TOP_N = Number(process.env.RECOMMENDATION_GUIDANCE_TOP_N ?? 5);

/**
 * avoidance.ts의 buildAvoidanceInstruction()과 병렬 구조 — 최근 항목 빈도를
 * 조회·요약해서 프롬프트에 바로 넣을 안내 텍스트를 만든다. 이력이 너무 적으면
 * (표본 부족으로 우연히 편향될 수 있어서) null을 반환해 지시 자체를 생략한다.
 *
 * 이번 버그가 "서로 다른 주제인데도" 반복된 사례였으므로, 핵심 방어선은
 * clusterId(주제)가 아니라 category 전체(전 사용자, 전 주제) 기준 최근
 * 빈도다 — clusterId/userId는 있으면 추가 참고 정보로만 곁들인다.
 */
export async function buildRecommendationGuidance(
  category: RecommendationCategory,
  opts: { userId?: string; sinceDays?: number } = {}
): Promise<RecommendationGuidance | null> {
  const globalRecords = await queryRecommendations(category, { sinceDays: opts.sinceDays });
  if (globalRecords.length < GUIDANCE_MIN_HISTORY) return null;

  const recentGlobalFrequency = summarizeItemFrequency(globalRecords);
  const userRecords = opts.userId
    ? await queryRecommendations(category, { sinceDays: opts.sinceDays, userId: opts.userId })
    : [];
  const recentUserFrequency = summarizeItemFrequency(userRecords);

  const topOverused = Array.from(recentGlobalFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, GUIDANCE_TOP_N)
    .map(([name, count]) => `${name}(최근 ${count}회)`);

  const categoryLabel = category === "book" ? "책" : category === "statistic" ? "통계/자료" : "사례";
  const instructionText = `
[추천 다양성 확보 — 반드시 반영할 것]
최근 다른 학생들에게 자주 추천된 ${categoryLabel} 항목: ${topOverused.join(", ")}.
최근 추천 이력에 존재하는 항목은 우선순위를 낮춰라. 단, 주제와의 적합성이
압도적으로 높은 경우에는 동일 항목을 다시 추천할 수 있다. 단순히 유명하거나
검증하기 쉽다는 이유만으로 최근 추천 항목을 다시 선택하지 마라. 주제와 충분히
관련 있으면서 최근 사용 빈도가 낮은 대안을 우선적으로 탐색하라.
`.trim();

  return { instructionText, recentGlobalFrequency, recentUserFrequency };
}
