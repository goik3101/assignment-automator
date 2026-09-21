import { getServiceClient } from "@/lib/supabase/service-client";

// 기획서 6-2, N7: 전부 잠정값. 배포 전 실제 데이터로 검증 후 조정할 것.
// 코드 수정 없이 튜닝할 수 있게 전부 .env로 뺐다.
const WINDOW_MONTHS = Number(process.env.CLUSTER_SATURATION_WINDOW_MONTHS ?? 3);
const SIMILARITY_THRESHOLD = Number(process.env.CLUSTER_SATURATION_SIMILARITY ?? 0.85);
// 라플라스 스무딩 계수. 기획서 6-2: "K=20~30, 하드컷 병용하지 않음"
const SMOOTHING_K = Number(process.env.CLUSTER_SATURATION_SMOOTHING_K ?? 25);
const MILD_RATIO = Number(process.env.CLUSTER_SATURATION_MILD_RATIO ?? 0.3);
const STRONG_RATIO = Number(process.env.CLUSTER_SATURATION_STRONG_RATIO ?? 0.55);

export interface SaturationInfo {
  totalCount: number;
  similarCount: number;
  ratio: number;
}

/**
 * 클러스터 쏠림 비율을 계산한다. (유사건수+1)/(전체건수+K) 라플라스 스무딩 적용 —
 * 초반 표본이 적을 때 우연히 100%/0%로 튀는 걸 막는다 (계절성 트래픽 급증 대비).
 */
export async function getClusterSaturation(
  clusterId: string,
  excludeSubmissionId?: string
): Promise<SaturationInfo> {
  const supabase = getServiceClient();
  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - WINDOW_MONTHS);
  // 임베딩 모델을 바꾼 시점(2026-09-22, OpenAI)보다 오래된 결과물 임베딩은 다른 벡터 공간이라 유사도 비교가 무의미하다 — 계산에서 제외한다(삭제하지 않음).
  const epoch = process.env.EMBEDDING_EPOCH ? new Date(process.env.EMBEDDING_EPOCH) : null;
  if (epoch && !Number.isNaN(epoch.getTime()) && epoch > windowStart) windowStart.setTime(epoch.getTime());

  const { data, error } = await supabase.rpc("cluster_saturation", {
    p_cluster_id: clusterId,
    p_similarity_threshold: SIMILARITY_THRESHOLD,
    p_window_start: windowStart.toISOString(),
    p_exclude_submission_id: excludeSubmissionId ?? null,
  });
  if (error) throw new Error(`클러스터 쏠림도 계산 실패: ${error.message}`);

  const row = (data as { total_count: number; similar_count: number }[] | null)?.[0];
  const totalCount = row?.total_count ?? 0;
  const similarCount = row?.similar_count ?? 0;
  const ratio = (similarCount + 1) / (totalCount + SMOOTHING_K);

  return { totalCount, similarCount, ratio };
}

/**
 * 쏠림 비율에 따라 생성 프롬프트에 넣을 회피 지시를 만든다. 표본이 적거나
 * 쏠림이 낮으면 null(지시 없음) — 절대 개수가 아니라 "비율"로만 판단한다 (기획서 6-2).
 */
export async function buildAvoidanceInstruction(
  clusterId: string,
  excludeSubmissionId?: string
): Promise<string | null> {
  const { ratio, totalCount, similarCount } = await getClusterSaturation(clusterId, excludeSubmissionId);
  // 회피 지시 발동 비율은 향후 관리자 대시보드(M7, 기획서 11-6)의 핵심 지표라
  // 지금부터 로그로 남겨둔다.
  console.log(
    `[avoidance] cluster=${clusterId} total=${totalCount} similar=${similarCount} ratio=${ratio.toFixed(3)}`
  );

  if (ratio >= STRONG_RATIO) {
    console.log(`[avoidance] cluster=${clusterId} -> STRONG 지시 발동`);
    return "이 과제에는 이미 비슷한 소재·관점의 답변이 많이 몰려 있다. " +
      "뻔하거나 가장 먼저 떠오르는 접근은 피하고, 눈에 띄게 다른 소재·관점·구성으로 작성할 것.";
  }
  if (ratio >= MILD_RATIO && totalCount >= 3) {
    console.log(`[avoidance] cluster=${clusterId} -> MILD 지시 발동`);
    return "이 과제로 이미 몇 건 제출된 사례가 있다. " +
      "가능하면 흔히 쓰이는 소재보다는 조금 다른 각도나 개인적인 요소를 섞어서 작성할 것.";
  }
  return null;
}
