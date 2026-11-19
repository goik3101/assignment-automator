// 인물·대상 자동 선정이 어떤 후보를 내는지 눈으로 본다 — 후보 생성+검증 호출이라 건당 약 $0.02. DB에 쓰지 않는다(history 빈 배열).
// 왜: 후보 프롬프트가 "덜 알려졌어도 … 대상을 절반 이상 포함"하라고 해서 인지도 낮은 대상이 나올 수 있다는 지적(2026-11-19).
// 인지도는 사람이 목록을 읽고 판단한다. 같은 안내문을 프롬프트 수정 전·후에 돌려 비교한다.
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/subject-candidates-check.ts 역사-03 사회-01 ...
import fs from "node:fs";
import path from "node:path";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));
process.env.SOURCE_STATS_LOG = "off";
const { selectSubjectForTask } = await import("@/lib/selection/subject-selection");
const { withLlmTrace } = await import("@/lib/llm");
const { summarizeTrace } = await import("@/lib/llm/usage");

const SD = path.join(process.cwd(), "scratchpad", "measure", process.env.SD_IN ?? "screen");
for (const id of process.argv.slice(2)) {
  const core = JSON.parse(fs.readFileSync(path.join(SD, `${id}.analysis.json`), "utf8"));
  const lines: string[] = [];
  const orig = console.log.bind(console);
  console.log = (...a: unknown[]) => {
    const l = a.map(String).join(" ");
    if (l.startsWith("[selection] 후보=")) lines.push(l);
    else if (!l.startsWith("[")) orig(...a);
  };
  const { picked, usage } = await withLlmTrace(`subj:${id}`, async (trace) => {
    const picked = await selectSubjectForTask({ subject: "", info: core }, { history: [], userId: null, scopeKey: null });
    return { picked, usage: summarizeTrace(trace) };
  });
  console.log = orig;
  console.log(`\n■ ${id} — 선택: ${picked ? picked.name : "(선정 과제 아님/실패)"} · $${usage.estimatedCostUsd.toFixed(3)}`);
  for (const l of lines) {
    const m = /후보=(\[.*\]) 선택=/.exec(l);
    if (m) {
      try { console.log("   후보: " + (JSON.parse(m[1]) as { n: string }[]).map((c) => c.n).join(" / ")); } catch { console.log("   " + l.slice(0, 300)); }
    }
  }
}
