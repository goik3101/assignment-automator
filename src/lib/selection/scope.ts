import { embedForClustering } from "@/lib/gemini/embeddings";
import { coreTaskInfoToClusteringText } from "@/lib/clusters/core-task-text";
import { getServiceClient } from "@/lib/supabase/service-client";
import type { CoreTaskInfo } from "@/types/task";

const MATCH_THRESHOLD = Number(process.env.CLUSTER_MATCH_THRESHOLD ?? 0.9);

/**
 * "같은 수행평가"의 식별자(cluster_id)를 쓰기 없이 조회한다. identifyCluster()와 달리 클러스터를 만들거나 centroid를 옮기지 않는다
 * (학습 모드 추천·테스트처럼 생성 흐름이 아닌 곳에서 이력 범위만 알고 싶을 때). 확실히 같은 과제(유사도 임계 이상)가 없으면 null —
 * 이 경우 호출부는 이력을 점수에 쓰지 않는다(다른 과제 기록을 섞지 않기 위해).
 */
export async function lookupClusterReadOnly(info: CoreTaskInfo): Promise<string | null> {
  try {
    const embedding = await embedForClustering(coreTaskInfoToClusteringText(info));
    const { data, error } = await getServiceClient().rpc("match_cluster", { query_embedding: embedding, min_similarity: MATCH_THRESHOLD });
    if (error) return null;
    return (data as { id: string }[] | null)?.[0]?.id ?? null;
  } catch {
    return null;
  }
}
