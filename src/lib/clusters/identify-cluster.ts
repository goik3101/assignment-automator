import { generate } from "@/lib/llm";
import { Type } from "@google/genai";
import { embedForClustering } from "@/lib/gemini/embeddings";
import { getServiceClient, parsePgVector } from "@/lib/supabase/service-client";
import { coreTaskInfoToClusteringText } from "./core-task-text";
import type { CoreTaskInfo } from "@/types/task";

// 기획서 N7: 배포 전 실제 안내문 샘플 10~20개로 임계값을 수동 검증할 것.
// 지금은 잠정값이며 .env로 바로 조정 가능하게 해둠 (코드 수정 없이 튜닝하려고).
const MATCH_THRESHOLD = Number(process.env.CLUSTER_MATCH_THRESHOLD ?? 0.9);
const AMBIGUOUS_FLOOR = Number(process.env.CLUSTER_AMBIGUOUS_FLOOR ?? 0.8);

export interface IdentifyClusterResult {
  clusterId: string;
  isNewCluster: boolean;
  similarity: number | null;
}

interface MatchCandidate {
  id: string;
  similarity: number;
  match_count: number;
}

/**
 * 기획서 6-0: 안내문(core_task_info)의 "과제 임베딩"을 계산해서 기존 클러스터
 * centroid와 비교하고, 매칭되면 그 클러스터에, 아니면 새 클러스터를 만들어 배정한다.
 * 이 함수는 항상 생성(essay/plan) 이전에 호출해야 한다 — 이 순서가 바뀌면 M3에서
 * 붙일 회피 지시를 생성 프롬프트에 반영할 수 없다 (기획서 5-0 핵심 원칙).
 */
export async function identifyCluster(coreTaskInfo: CoreTaskInfo): Promise<IdentifyClusterResult> {
  const text = coreTaskInfoToClusteringText(coreTaskInfo);
  const embedding = await embedForClustering(text);
  const supabase = getServiceClient();

  const { data, error } = await supabase.rpc("match_cluster", {
    query_embedding: embedding,
    min_similarity: AMBIGUOUS_FLOOR,
  });
  if (error) throw new Error(`클러스터 매칭 조회 실패: ${error.message}`);

  const nearest = (data as MatchCandidate[] | null)?.[0];

  let matched = false;
  if (nearest) {
    matched =
      nearest.similarity >= MATCH_THRESHOLD || (await confirmSameAssignment(text, nearest.id));
  }

  if (matched && nearest) {
    await updateCentroid(nearest.id, embedding, nearest.match_count);
    await logMatch(nearest.id, nearest.similarity, false, text);
    return { clusterId: nearest.id, isNewCluster: false, similarity: nearest.similarity };
  }

  const newClusterId = await createCluster(embedding);
  await logMatch(newClusterId, nearest?.similarity ?? null, true, text);
  return { clusterId: newClusterId, isNewCluster: true, similarity: nearest?.similarity ?? null };
}

/** 유사도가 애매한 구간(AMBIGUOUS_FLOOR~MATCH_THRESHOLD)일 때만 호출되는 LLM 확인. */
async function confirmSameAssignment(newText: string, candidateClusterId: string): Promise<boolean> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("cluster_match_logs")
    .select("sample_text")
    .eq("cluster_id", candidateClusterId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sampleText = (data as { sample_text: string } | null)?.sample_text;
  if (!sampleText) return false; // 비교할 샘플이 없으면 안전하게 "다른 과제"로 취급
  const response = await generate({
      label: "identify-cluster.ts:76",
      role: "lite",
      prompt: `두 수행평가 과제 설명이 사실상 "같은 과제"인지 판단해줘.
(학교나 학생이 달라도, 같은 주제와 같은 요구사항이면 같은 과제로 본다.)

[과제 A]
${sampleText}

[과제 B]
${newText}`,
      schema: {
        type: Type.OBJECT,
        properties: { same: { type: Type.BOOLEAN } },
        required: ["same"],
      },
    });

  try {
    return JSON.parse(response.text ?? "{}").same === true;
  } catch {
    return false;
  }
}

async function updateCentroid(clusterId: string, newEmbedding: number[], matchCount: number) {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("clusters")
    .select("centroid_vector")
    .eq("id", clusterId)
    .single();
  if (error || !data) throw new Error(`클러스터 조회 실패: ${error?.message}`);

  // 이동평균: 기존 centroid를 match_count번어치 가중치로 보고 새 값 1개를 더 섞는다.
  const current = parsePgVector((data as { centroid_vector: unknown }).centroid_vector);
  const next = current.map((v, i) => (v * matchCount + newEmbedding[i]) / (matchCount + 1));

  const { error: updateError } = await supabase
    .from("clusters")
    .update({ centroid_vector: next, match_count: matchCount + 1 })
    .eq("id", clusterId);
  if (updateError) throw new Error(`클러스터 centroid 갱신 실패: ${updateError.message}`);
}

async function createCluster(embedding: number[]): Promise<string> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("clusters")
    .insert({ centroid_vector: embedding, match_count: 1 })
    .select("id")
    .single();
  if (error || !data) throw new Error(`클러스터 생성 실패: ${error?.message}`);
  return (data as { id: string }).id;
}

async function logMatch(
  clusterId: string,
  similarity: number | null,
  isNewCluster: boolean,
  sampleText: string
) {
  const supabase = getServiceClient();
  // 디버그 로그라 실패해도 파이프라인을 막을 이유는 없지만, 콘솔에는 남긴다.
  const { error } = await supabase.from("cluster_match_logs").insert({
    cluster_id: clusterId,
    similarity,
    is_new_cluster: isNewCluster,
    sample_text: sampleText,
  });
  if (error) console.error("[identifyCluster] 로그 저장 실패", error);
}
