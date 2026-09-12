import { embedForDiversity } from "@/lib/gemini/embeddings";
import { getServiceClient } from "@/lib/supabase/service-client";
import type { EssayResult, PlanResult } from "@/types/task";

export function essayResultToText(result: EssayResult): string {
  return result.markdown;
}

export function planResultToText(result: PlanResult): string {
  return result.content;
}

/**
 * "결과물 임베딩"을 계산해서 task_embeddings에 저장한다.
 * embedForClustering(과제 임베딩)과 절대 섞지 말 것 — 반드시 embedForDiversity만 쓴다.
 *
 * isRegeneration을 true로 주면(M6에서 F6 재생성 연동 시 사용) 같은 submissionId의
 * 기존 행들을 먼저 is_current=false로 내리고 새 버전을 is_current=true로 추가한다
 * (기획서 6-2, 9-5: 비율 계산은 최신 버전만 포함해야 하고, 이전 버전은 감사 추적용으로
 * 남겨둔다). 최초 생성 시에는 false로 둔다 — 내릴 이전 버전이 없기 때문.
 */
export async function saveResultEmbedding(params: {
  clusterId: string;
  submissionId: string;
  resultText: string;
  isRegeneration?: boolean;
}): Promise<void> {
  const embedding = await embedForDiversity(params.resultText);
  const supabase = getServiceClient();

  if (params.isRegeneration) {
    const { error: supersedeError } = await supabase
      .from("task_embeddings")
      .update({ is_current: false })
      .eq("submission_id", params.submissionId)
      .eq("is_current", true);
    if (supersedeError) {
      throw new Error(`이전 버전 처리 실패: ${supersedeError.message}`);
    }
  }

  const { error } = await supabase.from("task_embeddings").insert({
    submission_id: params.submissionId,
    cluster_id: params.clusterId,
    content_embedding: embedding,
    is_current: true,
  });
  if (error) throw new Error(`결과물 임베딩 저장 실패: ${error.message}`);
}
