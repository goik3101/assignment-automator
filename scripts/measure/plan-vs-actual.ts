// 분량 계획(length-plan)과 실제 생성 글자 수가 얼마나 맞는지 본다 — 모델 호출 0, 비용 0.
// screen-dump가 저장한 안내문 분석(<id>.analysis.json)과 결과 화면(<id>.md)을 짝지어 단계마다 계획 범위 대비 실제 글자 수를 센다.
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/plan-vs-actual.ts [폴더=scratchpad/measure/screen]
import fs from "node:fs";
import path from "node:path";
const lp = await import("@/lib/essay/length-plan");
const fr = await import("@/lib/essay/form-requirements");
const { submittedLength } = await import("@/lib/essay/submitted-length");
const dir = process.argv[2] ?? path.join(process.cwd(), "scratchpad", "measure", "screen");
const rows: { id: string; label: string; role: string; min: number; max: number; actual: number }[] = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".analysis.json")).sort()) {
  const id = f.replace(".analysis.json", "");
  const mdPath = path.join(dir, `${id}.md`);
  if (!fs.existsSync(mdPath)) continue;
  const core = fr.applyFormRequirements(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  const labels = core.task_elements.map((e: { label: string }) => e.label);
  const cards = new Map<string, string>();
  let cur: string | null = null;
  for (const line of fs.readFileSync(mdPath, "utf8").split("\n")) {
    const m = /^=+ 카드: (.+?) =+$/.exec(line);
    if (m) { cur = m[1]; cards.set(cur, ""); continue; }
    if (/^=+ 외부 제작 계획/.test(line)) { cur = null; continue; }
    if (cur && !line.startsWith("▣") && !line.startsWith("전체 출처")) cards.set(cur, `${cards.get(cur)}\n${line}`);
  }
  for (const el of core.task_elements.filter((e: { type: string }) => e.type === "text_submission")) {
    const text = cards.get(el.label);
    if (text === undefined) continue;
    const plan = lp.planLength(el, { topic: core.topic, requirements: core.requirements, guide: core.writing_guide, labels, siblings: labels } as never);
    rows.push({ id, label: el.label, role: plan.role, min: plan.min, max: plan.max, actual: submittedLength(text) });
  }
}
const state = (r: (typeof rows)[number]) => (r.actual < r.min * 0.8 ? "짧음" : r.actual > r.max * 1.25 ? "김" : "범위");
const cnt = (s: string) => rows.filter((r) => state(r) === s).length;
console.log(`단계 ${rows.length}개 · 계획 범위 안 ${cnt("범위")} · 짧음(최소의 80% 미만) ${cnt("짧음")} · 김(최대의 125% 초과) ${cnt("김")}`);
const roles = new Map<string, typeof rows>();
for (const r of rows) roles.set(r.role, [...(roles.get(r.role) ?? []), r]);
console.log("\n역할 | 단계 수 | 범위 | 짧음 | 김 | 실제/계획중앙 비(중앙)");
for (const [role, rs] of [...roles].sort((a, b) => b[1].length - a[1].length)) {
  const ratios = rs.map((r) => r.actual / ((r.min + r.max) / 2)).sort((a, b) => a - b);
  console.log(`${role} | ${rs.length} | ${rs.filter((r) => state(r) === "범위").length} | ${rs.filter((r) => state(r) === "짧음").length} | ${rs.filter((r) => state(r) === "김").length} | ${ratios[Math.floor(ratios.length / 2)].toFixed(2)}`);
}
console.log("\n벗어난 단계(상위):");
for (const r of rows.filter((x) => state(x) !== "범위").sort((a, b) => Math.abs(Math.log(b.actual / ((b.min + b.max) / 2))) - Math.abs(Math.log(a.actual / ((a.min + a.max) / 2)))).slice(0, 14))
  console.log(`  ${r.id} ${r.label.slice(0, 14)} [${r.role}] 계획 ${r.min}~${r.max} 실제 ${r.actual} (${state(r)})`);
