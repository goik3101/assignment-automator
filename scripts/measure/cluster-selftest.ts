// 읽기 전용 자가 점검: 실제 DB의 가장 최근 클러스터 샘플 텍스트를 다시 임베딩해 match_cluster가 **자기 자신을 찾는지** 본다.
// (거대 안내문이 전부 "매칭 없음"으로 나온 것이 RPC 고장 때문이 아님을 확인하려는 것 — 아무것도 쓰지 않는다.)
import path from "node:path";
process.loadEnvFile(path.join(process.cwd(), ".env.local"));
const { getServiceClient } = await import("@/lib/supabase/service-client");
const { embedForClustering } = await import("@/lib/gemini/embeddings");
const supabase = getServiceClient();
const { data } = await supabase.from("cluster_match_logs").select("cluster_id, sample_text").order("created_at", { ascending: false }).limit(3);
for (const row of (data ?? []) as { cluster_id: string; sample_text: string }[]) {
  const emb = await embedForClustering(row.sample_text);
  const { data: m, error } = await supabase.rpc("match_cluster", { query_embedding: emb, min_similarity: 0.8 });
  const top = (m as { id: string; similarity: number }[] | null)?.[0];
  console.log(`${row.cluster_id.slice(0, 8)} → ${error ? "오류 " + error.message : top ? `${top.id.slice(0, 8)} sim=${top.similarity.toFixed(3)} ${top.id === row.cluster_id ? "(자기 자신)" : "(다른 클러스터)"}` : "매칭 없음"}`);
}
