// 사용자 평가(result_ratings, 마이그레이션 0022)를 읽어 유형별로 집계한다 — 읽기 전용, 비용 0.
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/ratings-report.ts [일수=30]
// 분량 판단("너무 길어요/적당해요/너무 짧아요")과 실제 글자 수를 칸 이름 묶음별로 나란히 본다 — 분량 기준을 이 숫자로 보정한다.
import path from "node:path";
process.loadEnvFile(path.join(process.cwd(), ".env.local"));
const { getServiceClient } = await import("@/lib/supabase/service-client");
const days = Number(process.argv[2] ?? 30);
const since = new Date(Date.now() - days * 86400_000).toISOString();
const { data, error } = await getServiceClient().from("result_ratings").select("quality,length,kind,context,created_at").gte("created_at", since).limit(5000);
if (error) throw error;
type Row = { quality: string | null; length: string | null; kind: string; context: { steps?: { label: string; chars: number }[]; totalChars?: number; latencyMs?: number } };
const rows = (data ?? []) as Row[];
console.log(`최근 ${days}일 평가 ${rows.length}건`);
const pct = (n: number, t: number) => (t ? `${Math.round((n / t) * 100)}%` : "-");
const q = rows.filter((r) => r.quality);
console.log(`품질: 좋아요 ${q.filter((r) => r.quality === "good").length} / 아쉬워요 ${q.filter((r) => r.quality === "bad").length} (좋아요 ${pct(q.filter((r) => r.quality === "good").length, q.length)})`);
const l = rows.filter((r) => r.length);
console.log(`분량: 너무 길어요 ${l.filter((r) => r.length === "long").length} / 적당해요 ${l.filter((r) => r.length === "ok").length} / 너무 짧아요 ${l.filter((r) => r.length === "short").length}`);
// 칸 이름 묶음(대충): 신문·보고서·발표·카드뉴스·기타
const group = (r: Row) => {
  const t = (r.context.steps ?? []).map((s) => s.label).join(" ");
  return /머리기사|인터뷰|사설|만평|신문/.test(t) ? "신문" : /보고서|탐구/.test(t) ? "보고서" : /발표|대본|스토리보드/.test(t) ? "발표" : /카드뉴스/.test(t) ? "카드뉴스" : "기타";
};
const by = new Map<string, Row[]>();
for (const r of rows) by.set(group(r), [...(by.get(group(r)) ?? []), r]);
console.log("\n유형 | 건수 | 평균 글자 | 길다 | 적당 | 짧다 | 좋아요");
for (const [g, rs] of by) {
  const avg = Math.round(rs.reduce((n, r) => n + (r.context.totalChars ?? 0), 0) / rs.length);
  const c = (v: string) => rs.filter((r) => r.length === v).length;
  console.log(`${g} | ${rs.length} | ${avg} | ${c("long")} | ${c("ok")} | ${c("short")} | ${rs.filter((r) => r.quality === "good").length}/${rs.filter((r) => r.quality).length}`);
}
