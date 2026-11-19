// 우리 분량 계획 총량 대 ChatGPT식 기준선(screen_bare) 비교 — 모델 호출 0, 비용 0. 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/plan-vs-bare.ts
import fs from "node:fs";
import path from "node:path";
const lp = await import("@/lib/essay/length-plan");
const fr = await import("@/lib/essay/form-requirements");
const { withBookBodyItem } = await import("@/lib/essay/book-body-item");
const base = "scratchpad/measure";
const newest = new Map<string, { file: string; t: number }>();
for (const d of fs.readdirSync(base).filter((x) => x.startsWith("screen") && x !== "screen_bare" && fs.statSync(path.join(base, x)).isDirectory())) {
  for (const f of fs.readdirSync(path.join(base, d)).filter((x) => x.endsWith(".analysis.json"))) {
    const id = f.replace(/_.*|\.analysis\.json$/g, "");
    const p = path.join(base, d, f);
    const t = fs.statSync(p).mtimeMs;
    if (!newest.has(id) || newest.get(id)!.t < t) newest.set(id, { file: p, t });
  }
}
const body = (p: string) => fs.readFileSync(p, "utf8").split("\n").filter((l) => !l.startsWith("# ")).join("\n").replace(/\[\d+(,\d+)*\]/g, "").trim().length;
const rows: any[] = [];
for (const [id, { file }] of [...newest].sort()) {
  const bp = path.join(base, "screen_bare", id + ".md");
  if (!fs.existsSync(bp)) continue;
  const core = withBookBodyItem(fr.applyFormRequirements(JSON.parse(fs.readFileSync(file, "utf8"))));
  const labels = core.task_elements.map((e: any) => e.label);
  const ctx = { requirements: core.requirements, guide: core.writing_guide, labels, topic: core.topic, siblings: core.task_elements.map((e: any) => ({ label: e.label, description: e.description })), notice: core.notice_text, elements: core.task_elements };
  const els = core.task_elements.filter((e: any) => e.type === "text_submission");
  const targets = els.map((e: any) => lp.effectiveTarget(e, ctx) ?? 0);
  const total = targets.reduce((a: number, b: number) => a + b, 0);
  const bare = body(bp);
  rows.push({ id, steps: els.length, total, bare, ratio: total / bare });
}
console.log("id       단계  우리계획총량  ChatGPT식  비(우리/GPT)");
for (const r of rows) console.log(r.id.padEnd(8), String(r.steps).padStart(3), String(r.total).padStart(10), String(r.bare).padStart(10), r.ratio.toFixed(2).padStart(8), r.ratio > 1.5 ? " ▲" : r.ratio < 0.67 ? " ▽" : "");
const rs = rows.map((r) => r.ratio).sort((a, b) => a - b);
const q = (p: number) => rs[Math.floor(rs.length * p)].toFixed(2);
console.log("n", rs.length, "중앙", q(0.5), "25%", q(0.25), "75%", q(0.75), "최소", rs[0].toFixed(2), "최대", rs[rs.length - 1].toFixed(2));
// log-ratio spread
const lg = rs.map((x) => Math.log(x)); const m = lg.reduce((a, b) => a + b, 0) / lg.length; const sd = Math.sqrt(lg.reduce((a, b) => a + (b - m) ** 2, 0) / lg.length);
console.log("로그비 표준편차", sd.toFixed(2), "(→ 전형적 어긋남 ×", Math.exp(sd).toFixed(2), ")");
