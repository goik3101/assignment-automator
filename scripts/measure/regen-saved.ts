// 저장된 안내문 분석(screen-dump의 <id>.analysis.json)으로 **글 생성만** 다시 돌리고 호출별로 쪼갠다(분석 호출 없음 → 건당 $0.02~0.09).
// 왜: 감사 도구는 저장된 옛 결과만 보므로, 코드를 고친 뒤 실제로 나아졌는지·어느 호출이 시간을 먹는지는 현재 코드로 한 번 돌려야 안다.
// 결과는 screen-dump와 같은 모양(<SD_DIR>/<id>.md)으로 저장돼 screen-lint·cross-step-audit·plan-vs-actual이 그대로 읽는다.
// 쏠림 억제·임베딩 저장 경로는 타지 않는다(generateEssay 직접 호출, selection.history 빈 배열).
// 사용: SD_DIR=screen_now node --import ./scripts/measure/loader/register.mjs scripts/measure/regen-saved.ts 정보-02 과학-01 ...
//   기본 입력 폴더는 scratchpad/measure/screen. 책 처방전(개선 요청2)은 id "책처방전" — scratchpad/measure/bookrx.analysis.json.
import fs from "node:fs";
import path from "node:path";

const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
process.env.SOURCE_STATS_LOG = "off";

const { generateEssay } = await import("@/lib/gemini/generate-essay");
const { withLlmTrace } = await import("@/lib/llm");
const { summarizeTrace } = await import("@/lib/llm/usage");
const { submittedLength } = await import("@/lib/essay/submitted-length");

const IN = path.join(REPO, "scratchpad", "measure", "screen");
const OUT = path.join(REPO, "scratchpad", "measure", process.env.SD_DIR ?? "screen_now");
fs.mkdirSync(OUT, { recursive: true });

const BOOKRX_INSTRUCTIONS = "2차시에서 뽑은 친구의 고민은 '소심한 성격이라 새 친구를 잘 사귀지 못한다'는 거야. 3차시 책은 AI가 골라 줘.";

for (const id of process.argv.slice(2)) {
  let core: import("@/types/task").CoreTaskInfo;
  let instructions: string | undefined;
  if (id === "책처방전") {
    core = JSON.parse(fs.readFileSync(path.join(REPO, "scratchpad", "measure", "bookrx.analysis.json"), "utf8"));
    instructions = BOOKRX_INSTRUCTIONS;
  } else {
    core = JSON.parse(fs.readFileSync(path.join(IN, `${id}.analysis.json`), "utf8"));
    const head = fs.readFileSync(path.join(IN, `${id}.md`), "utf8").split("\n").find((l) => l.startsWith("학생 지침:")) ?? "";
    const v = head.replace("학생 지침:", "").trim();
    instructions = v && v !== "(없음)" ? v : undefined;
  }
  const t0 = Date.now();
  try {
    const { essay, usage, calls } = await withLlmTrace(`regen:${id}`, async (trace) => {
      const essay = await generateEssay({ subject: "", coreTaskInfo: core, instructions, selection: { history: [] } });
      return { essay, usage: summarizeTrace(trace), calls: trace.calls.map((c) => ({ label: c.label, ms: c.ms, inTok: c.inputTokens, outTok: c.outputTokens, reason: c.reasoningTokens, search: c.searchCalls })) };
    });
    const sec = (Date.now() - t0) / 1000;
    const out: string[] = [`# ${id}  (생성 ${sec.toFixed(1)}초 · $${usage.estimatedCostUsd.toFixed(4)} · 호출 ${usage.calls}건)`, `학생 지침: ${instructions ?? "(없음)"}`];
    if (essay && essay.type === "essay") {
      if (essay.noSourcesWarning) out.push("▣ 맨 위 배너: 이 내용은 검색으로 검증되지 않았어요");
      for (const s of essay.sections ?? []) {
        out.push(`\n==================== 카드: ${s.label} ====================`);
        if (s.noSourcesWarning) out.push("▣ 배너: 이 내용은 검색으로 검증되지 않았어요");
        if (s.lengthWarning) out.push(`▣ 경고(분량·형식): ${s.lengthWarning}`);
        if (s.structureWarning) out.push(`▣ 경고(항목): ${s.structureWarning}`);
        if (s.authorWarning) out.push(`▣ 경고(저자): ${s.authorWarning}`);
        out.push(s.markdown);
        if (s.productionNotes) out.push(`\n▣ 제작 참고(제출하는 글 아님): ${s.productionNotes}`);
        out.push(`▣ 이 카드의 출처 ${s.sources.length}개`);
      }
      out.push(`\n전체 출처 ${essay.sources.length}개: ${essay.sources.map((x) => `[${x.n}] ${x.title} <${x.url}>`).join(" | ")}`);
      fs.writeFileSync(path.join(OUT, `${id}.analysis.json`), JSON.stringify(core, null, 1), "utf8");
    } else out.push(`(생성 실패: ${essay?.type})`);
    fs.writeFileSync(path.join(OUT, `${id}.md`), out.join("\n"), "utf8");
    console.log(`\n■ ${id}: ${sec.toFixed(1)}초 · $${usage.estimatedCostUsd.toFixed(4)} · 글자 ${essay && essay.type === "essay" ? (essay.sections ?? []).map((s) => submittedLength(s.markdown)).join("/") : "-"}`);
    for (const c of calls) console.log(`   ${c.label.padEnd(34)} ${(c.ms / 1000).toFixed(1).padStart(5)}초  입력 ${String(c.inTok).padStart(6)}  출력 ${String(c.outTok).padStart(5)}  추론 ${String(c.reason).padStart(5)}  검색 ${c.search}`);
  } catch (e) {
    console.log(`■ ${id}: 실패 ${(e as Error).message}`);
  }
}
