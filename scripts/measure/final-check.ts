// 최종 검증: 실제 안내문 사진 4종 + 고정 자료 2종으로 완성 원고를 만들고 결함을 한 번에 센다.
// 사용: node --import ./scripts/measure/loader/register.mjs scratchpad/measure/final-check.ts [사례id ...]
import fs from "node:fs";
import path from "node:path";

const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
process.env.SOURCE_STATS_LOG = "off";

const { analyzeAssignment } = await import("@/lib/gemini/analyze");
const { generateEssay } = await import("@/lib/gemini/generate-essay");
const { withLlmTrace } = await import("@/lib/llm");
const { summarizeTrace } = await import("@/lib/llm/usage");
const { findOwnActivitySentences, countBlanks } = await import("@/lib/essay/own-activity");
const { visualPolicy, findBannedVisuals, hasDataTable, needsDataTable } = await import("@/lib/essay/data-visual");
const { isLandingPage } = await import("@/lib/essay/research-notes");
const { findRepeatedStatements } = await import("@/lib/essay/repetition");
const { isPlanSentence } = await import("@/lib/essay/plan-citations");
const { findUsePlanSentences, evidenceSectionText } = await import("@/lib/essay/evidence-items");
const { buildRubric, rubricMisses, rubricPrompt } = await import("@/lib/essay/rubric-check");
const { scopeStatements, splitStatements } = await import("@/lib/essay/requirement-scope");
const { generate } = await import("@/lib/llm");
const { Type } = await import("@google/genai");

// 안내문 조건을 결과물과 대조한다. 생성 중에 쓰는 것과 같은 판정이지만 **완성된 글**에 다시 돌리는 것이라,
// "보완까지 거친 뒤에도 남은 미충족"을 센다(생성 중 판정이 스스로를 채점하지 않게 측정은 따로 돌린다).
async function rubricAudit(core: any, sections: { label: string; markdown: string }[]) {
  const scoped = scopeStatements(splitStatements([...core.requirements, core.writing_guide ?? ""]), core.task_elements, sections.map((s) => s.label));
  const items = buildRubric(scoped);
  if (items.length === 0) return { total: 0, miss: 0, lines: [] as string[] };
  const schema: any = {
    type: Type.OBJECT,
    properties: { results: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, ok: { type: Type.BOOLEAN }, fix: { type: Type.STRING } }, required: ["id", "ok"] } } },
    required: ["results"],
  };
  const res = await generate({
    label: "audit:rubric",
    role: "lite",
    prompt: rubricPrompt(items, sections.map((s) => ({ label: s.label, content: s.markdown }))),
    schema,
  });
  const misses = rubricMisses(JSON.parse(res.text ?? "{}"), items, sections.map((s) => s.label));
  return { total: items.length, miss: misses.reduce((n, m) => n + m.missing.length, 0), lines: misses.flatMap((m) => m.missing.map((x) => `${m.label}: ${x}`)) };
}

const IMG = path.join(REPO, "수행평가 안내문");
interface Case {
  id: string;
  images?: string[];
  analysisFile?: string;
  instructions?: string;
  extraRequirements?: string[];
}
const CASES: Case[] = [
  { id: "국어(발표)", images: ["국어 -1/KakaoTalk_20260526_213359166.jpg"], instructions: "인터넷 실명제 도입에 반대하는 입장으로 발표할게." },
  { id: "카드뉴스(역사)", images: ["역사-2/photo_2026-10-21_01-03-10 - 복사본.jpg"], instructions: "책: 윤태호 작가의 《사일구》(4·19혁명)를 읽었다." },
  { id: "신문(역사)", images: ["역사-1 - 복사본/KakaoTalk_20261021_232340155_02.jpg", "역사-1 - 복사본/KakaoTalk_20261021_232340155_01.jpg"] },
  { id: "영어(발명품)", images: ["영어-1 - 복사본/KakaoTalk_20261021_232340155_08.jpg", "영어-1 - 복사본/KakaoTalk_20261021_232340155_06.jpg", "영어-1 - 복사본/KakaoTalk_20261021_232340155_07.jpg"] },
  { id: "과학(산·염기)", images: ["KakaoTalk_20260928_165015557_01 - 복사본.jpg"] },
  { id: "사회 평가지", analysisFile: "social-analysis.json", instructions: "주제는 노인 빈곤과 기초연금 문제로 할게." },
];

const sentences = (t: string) =>
  t
    .split("\n")
    .filter((l) => !/^\s*(?:#|\|)/.test(l))
    .flatMap((l) => l.split(/(?<=[.!?。](?:\[\d+\])*)\s+/))
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((s) => s.length >= 8);

const only = process.argv.slice(2);
const rows: string[] = [];
for (const c of CASES) {
  if (only.length && !only.includes(c.id)) continue;
  const t0 = Date.now();
  try {
    const { result, usage, subject, core } = await withLlmTrace(c.id, async (trace) => {
      let subject: string;
      let core: Awaited<ReturnType<typeof analyzeAssignment>>["core_task_info"];
      if (c.analysisFile) {
        const a = JSON.parse(fs.readFileSync(path.join(REPO, "scratchpad", "measure", c.analysisFile), "utf8"));
        subject = a.subject;
        core = a.core_task_info;
      } else {
        const imgs = c.images!.map((rel) => ({ base64: fs.readFileSync(path.join(IMG, rel)).toString("base64"), mimeType: "image/jpeg" }));
        const a = await analyzeAssignment({ imageBase64: imgs[0].base64, imageMimeType: imgs[0].mimeType, extraImages: imgs.slice(1), instructions: c.instructions });
        subject = a.subject;
        core = a.core_task_info;
      }
      if (c.extraRequirements) core = { ...core, requirements: [...core.requirements, ...c.extraRequirements] };
      const textEls = core.task_elements.filter((e) => e.type === "text_submission");
      if (textEls.length === 0) return { result: null, usage: summarizeTrace(trace), subject, core };
      const result = await generateEssay({ subject, coreTaskInfo: core, instructions: c.instructions, selection: { history: [] } });
      return { result, usage: summarizeTrace(trace), subject, core };
    });
    if (!result || result.type !== "essay") {
      rows.push(`| ${c.id} | 글 단계 없음 또는 실패 | | | | | | | |`);
      continue;
    }
    const md = result.markdown;
    const policy = visualPolicy([...core.requirements, core.writing_guide ?? "", ...core.task_elements.map((e) => e.description)]);
    const banned = (result.sections ?? []).reduce((n, s) => n + findBannedVisuals(s.markdown, policy).length, 0);
    const tableNeeded = core.task_elements.filter((e) => e.type === "text_submission" && needsDataTable(e, core.requirements, core.writing_guide, core.task_elements.filter((x) => x.type === "text_submission").length === 1));
    const tableMissing = tableNeeded.filter((e) => !hasDataTable((result.sections ?? []).find((s) => s.label === e.label)?.markdown ?? "")).length;
    const uncited = sentences(md).filter((s) => /\d{3,4}년|\d+(?:\.\d+)?\s*%|\d+\s*[㎍μu]g?|\d{1,3},\d{3}/.test(s) && !/\[\d+\]/.test(s) && !/https?:/.test(s)).length;
    const planCited = sentences(md).filter((s) => /\[\d+\]/.test(s) && isPlanSentence(s.replace(/\[\d+\]\s*$/, ""))).length;
    const warn = (result.sections ?? []).filter((s) => s.noSourcesWarning || s.structureWarning || s.lengthWarning).length;
    const usePlan = (result.sections ?? []).reduce((n, sec) => n + findUsePlanSentences(evidenceSectionText(sec.markdown) ?? "").length, 0);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1); // 아래 대조 호출은 측정용이라 생성 시간에 넣지 않는다.
    const rubric = await rubricAudit(core, result.sections ?? []);
    if (rubric.lines.length) console.log(`  [${c.id}] 안내문 미충족: ${rubric.lines.join(" || ")}`);
    fs.writeFileSync(path.join(REPO, "scratchpad", "measure", "out", `fc-${c.id}.md`), md, "utf8");
    rows.push(
      `| ${c.id} | ${elapsed}초 | $${usage.estimatedCostUsd.toFixed(4)} | ${(result.sections ?? []).length}단계 ${md.length}자 | ${result.sources.length}개(첫화면 ${result.sources.filter((s) => isLandingPage(s.url)).length}) | 날조 ${findOwnActivitySentences(md).length} 빈칸 ${countBlanks(md)} | 금지자료 ${banned} 표누락 ${tableMissing} | 조건 ${rubric.total - rubric.miss}/${rubric.total} | 무각주수치 ${uncited} 계획각주 ${planCited} 쓰임설명 ${usePlan} 되풀이 ${findRepeatedStatements((result.sections ?? []).map((s) => ({ label: s.label, content: s.markdown }))).length} 경고 ${warn} |`
    );
    console.log(rows[rows.length - 1]);
    const bl = Object.entries(usage.byLabel).sort((a, b) => b[1].ms - a[1].ms);
    console.log(`  [${c.id}] 호출 ${usage.calls}건 경과 ${(usage.wallMs / 1000).toFixed(1)}초 호출시간합 ${(usage.sumCallMs / 1000).toFixed(1)}초`);
    for (const [label, v] of bl) console.log(`     ${(v.ms / 1000).toFixed(1).padStart(5)}초  ${String(v.calls).padStart(2)}회  ${label}${v.searchCalls ? ` (검색 ${v.searchCalls})` : ""}`);
  } catch (err) {
    rows.push(`| ${c.id} | 실패: ${String(err).slice(0, 60)} | | | | | | | |`);
    console.error(c.id, err);
  }
}

console.log("\n| 과제 | 시간 | 비용 | 분량 | 출처 | 정직성 | 금지·표 | 안내문조건 | 근거·문체 |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(r);
