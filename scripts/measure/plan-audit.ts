// 분량 계획이 안내문 34종에서 **어디를 어떻게 바꾸는지** 전수로 본다 — 모델 호출 0, 비용 0.
// 왜: 분량 구조 변경(총량 상한·작은 답 역할·단계별 손글씨 시간)이 멀쩡한 단계를 너무 짧게 만들거나 엉뚱하게 분류하지 않는지 확인한다(역효과 점검).
// 걸러서 찍는 것: ① 작은 답(short_answer)·문항형(qa_list)으로 분류된 단계(오분류 의심 — 라벨·설명을 같이 찍어 사람이 판단)
//   ② 총량 상한으로 줄어든 단계(비율) ③ 손글씨 시간으로 정해진 단계 ④ 최대가 400자 미만인데 그런 역할이 아닌 단계(너무 짧음 의심).
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/plan-audit.ts
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
const SMALL = new Set(["short_answer", "qa_list", "attachment", "form_box", "slogan", "scenes", "table", "reason"]);
const out = { small: [] as string[], capped: [] as string[], timed: [] as string[], short: [] as string[] };
let steps = 0;
for (const [id, { file }] of [...newest].sort()) {
  const core = withBookBodyItem(fr.applyFormRequirements(JSON.parse(fs.readFileSync(file, "utf8"))));
  const labels = core.task_elements.map((e: any) => e.label);
  const ctx = { requirements: core.requirements, guide: core.writing_guide, labels, topic: core.topic, siblings: core.task_elements.map((e: any) => ({ label: e.label, description: e.description })), notice: core.notice_text, elements: core.task_elements };
  for (const el of core.task_elements.filter((e: any) => e.type === "text_submission")) {
    steps++;
    const p = lp.planLength(el, ctx);
    const tag = `${id} [${el.label.slice(0, 18)}] ${p.role} ${p.min}~${p.max}`;
    if (p.role === "short_answer" || p.role === "qa_list") out.small.push(`${tag} | 항목 ${(el.required_items ?? []).length} | 설명: ${(el.description ?? "").slice(0, 70)}`);
    if (p.basis.includes("총량 상한")) out.capped.push(`${tag} | ${p.basis.slice(p.basis.indexOf("→ 안내문 전체"))}`);
    if (p.basis.includes("손으로 쓸 시간")) out.timed.push(`${tag} | ${p.basis.slice(p.basis.indexOf("→ 손으로"), p.basis.indexOf("→ 손으로") + 90)}`);
    if (p.max < 400 && !SMALL.has(p.role)) out.short.push(`${tag} | ${p.basis.slice(0, 70)}`);
  }
}
console.log(`단계 ${steps}개 (안내문 ${newest.size}종)\n`);
for (const [k, title] of [["small", "작은 답·문항형으로 분류된 단계 — 오분류인지 읽어 볼 것"], ["capped", "총량 상한으로 줄어든 단계"], ["timed", "손으로 쓸 시간으로 정해진 단계"], ["short", "최대 400자 미만인데 작은 답류가 아닌 단계(너무 짧음 의심)"]] as const) {
  console.log(`## ${title}: ${out[k].length}개`);
  out[k].forEach((l) => console.log("  " + l));
  console.log();
}
