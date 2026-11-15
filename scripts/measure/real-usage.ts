// 실제 서비스의 AI 요청 기록(ai_usage_log — 개인정보 없음)에서 경로별 시간·오류·비용을 본다. 읽기 전용.
import path from "node:path";
process.loadEnvFile(path.join(process.cwd(), ".env.local"));
const { getServiceClient } = await import("@/lib/supabase/service-client");
const days = Number(process.argv[2] ?? 3);
const since = new Date(Date.now() - days * 86400_000).toISOString();
const { data, error } = await getServiceClient()
  .from("ai_usage_log")
  .select("route,status,ok,wall_ms,cost_usd,calls,failed_calls,created_at")
  .gte("created_at", since)
  .limit(5000);
if (error) throw error;
type Row = NonNullable<typeof data>[number];
const by = new Map<string, Row[]>();
for (const r of data ?? []) by.set(r.route, [...(by.get(r.route) ?? []), r]);
const q = (a: number[], p: number) => (a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0);
console.log(`최근 ${days}일 · 요청 ${data?.length ?? 0}건`);
console.log("route | 건수 | 오류 | 429 | 중앙 | p90 | 30초초과 | 평균$");
for (const [route, rows] of [...by.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const w = rows.map((r) => r.wall_ms / 1000);
  const err = rows.filter((r) => !r.ok).length;
  const lim = rows.filter((r) => r.status === 429).length;
  const slow = w.filter((x) => x > 30).length;
  const cost = rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0) / rows.length;
  console.log(`${route} | ${rows.length} | ${err} | ${lim} | ${q(w, 0.5).toFixed(1)}s | ${q(w, 0.9).toFixed(1)}s | ${slow} | $${cost.toFixed(4)}`);
}
