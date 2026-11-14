// 읽기 전용 점검: ① 실제 DB 표의 행 수를 센다(테스트가 겹침방지 표에 흔적을 남기지 않았는지 전·후 비교용)
// ② 저장된 안내문 분석(an-giant-*.json)이 실제 클러스터 중 어디에 매칭될지 **match_cluster RPC만** 불러 본다 — centroid·로그를 갱신하지 않는다.
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/cluster-readonly-check.ts [counts|match]
import fs from "node:fs";
import path from "node:path";

const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));

const { getServiceClient } = await import("@/lib/supabase/service-client");
const { embedForClustering } = await import("@/lib/gemini/embeddings");
const { coreTaskInfoToClusteringText } = await import("@/lib/clusters/core-task-text");

const supabase = getServiceClient();
const mode = process.argv[2] ?? "counts";

if (mode === "counts" || mode === "both") {
  const out: Record<string, number | string> = {};
  for (const t of ["clusters", "task_embeddings", "cluster_match_logs", "recommendation_history", "user_histories"]) {
    const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
    out[t] = error ? `오류: ${error.message}` : (count ?? 0);
  }
  console.log(JSON.stringify({ at: new Date().toISOString(), ...out }));
}

if (mode === "match" || mode === "both") {
  const dir = path.join(REPO, "scratchpad", "measure", "out");
  const files = fs.readdirSync(dir).filter((f) => /^an-giant-.*\.json$/.test(f)).sort();
  const rows: string[] = [];
  for (const f of files) {
    const a = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    const text = coreTaskInfoToClusteringText(a.core_task_info);
    const emb = await embedForClustering(text);
    const { data, error } = await supabase.rpc("match_cluster", { query_embedding: emb, min_similarity: 0.8 });
    const nearest = (data as { id: string; similarity: number }[] | null)?.[0];
    rows.push(`${f.replace("an-giant-", "").replace(".json", "")}\t${error ? "오류 " + error.message : nearest ? `${nearest.id.slice(0, 8)} sim=${nearest.similarity.toFixed(3)}` : "매칭 없음(새 클러스터가 될 것)"}`);
  }
  console.log(rows.join("\n"));
}
