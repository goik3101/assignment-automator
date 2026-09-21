// 임베딩 모델 교체(Gemini → OpenAI text-embedding-3-small 768) 후 클러스터 중심 벡터를 다시 만든다.
// 클러스터 id는 그대로 두고(추천 이력의 scope_key = cluster_id가 유지됨) centroid_vector만, 클러스터에 남아 있는
// 안내문 샘플 텍스트(cluster_match_logs.sample_text)를 새 모델로 임베딩해 평균낸 값으로 바꾼다.
// 결과물 임베딩(task_embeddings)은 원문과 연결하지 않는 원칙 때문에 다시 만들 수 없어 그대로 두고, 저장 시각이
// EMBEDDING_EPOCH 이전인 행은 겹침 방지 계산에서 제외한다(avoidance.ts).
//
// 사용: npx tsx --tsconfig tsconfig.json --env-file=.env.local scripts/rebuild-cluster-centroids.ts [--apply]
//   기본은 미리보기(쓰기 없음). --apply면 이전 중심 벡터를 .local-backups/에 저장한 뒤 갱신한다.
import fs from "fs";
import { getServiceClient, parsePgVector } from "@/lib/supabase/service-client";
import { embedForClustering } from "@/lib/gemini/embeddings";

const APPLY = process.argv.includes("--apply");

async function main() {
  const sb = getServiceClient();
  const { data: clusters, error } = await sb.from("clusters").select("id, centroid_vector, match_count");
  if (error) throw error;
  const { data: logs, error: e2 } = await sb.from("cluster_match_logs").select("cluster_id, sample_text");
  if (e2) throw e2;

  const byCluster = new Map<string, Set<string>>();
  for (const l of logs ?? []) {
    const set = byCluster.get(l.cluster_id) ?? new Set<string>();
    set.add(l.sample_text);
    byCluster.set(l.cluster_id, set);
  }
  console.log(`클러스터 ${clusters?.length}개, 샘플 텍스트 보유 클러스터 ${byCluster.size}개, 서로 다른 샘플 ${[...byCluster.values()].reduce((a, s) => a + s.size, 0)}개`);

  const plan: { id: string; vec: number[]; samples: number }[] = [];
  for (const c of clusters ?? []) {
    const texts = [...(byCluster.get(c.id) ?? [])].slice(0, 12); // 클러스터당 최대 12개 샘플
    if (texts.length === 0) continue;
    const vs: number[][] = [];
    for (const t of texts) vs.push(await embedForClustering(t));
    const mean = vs[0].map((_, d) => vs.reduce((s, v) => s + v[d], 0) / vs.length);
    plan.push({ id: c.id, vec: mean, samples: texts.length });
  }
  console.log(`재계산 대상 ${plan.length}개 클러스터 (샘플 없는 ${(clusters?.length ?? 0) - plan.length}개는 그대로 둠)`);
  if (!APPLY) {
    console.log("미리보기 — 쓰기 없음. 적용하려면 --apply");
    return;
  }

  fs.mkdirSync(".local-backups", { recursive: true });
  const backup = `.local-backups/clusters_centroids_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(backup, JSON.stringify((clusters ?? []).map((c) => ({ id: c.id, match_count: c.match_count, centroid_vector: parsePgVector(c.centroid_vector as unknown) }))));
  console.log("이전 중심 벡터 백업:", backup);
  let ok = 0;
  for (const p of plan) {
    const { error: ue } = await sb.from("clusters").update({ centroid_vector: p.vec }).eq("id", p.id);
    if (ue) console.error("갱신 실패", p.id, ue.message);
    else ok++;
  }
  console.log(`갱신 완료 ${ok}/${plan.length}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
