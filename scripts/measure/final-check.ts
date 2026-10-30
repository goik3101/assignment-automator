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
      rows.push(`| ${c.id} | 글 단계 없음 또는 실패 | | | | | | |`);
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
    fs.writeFileSync(path.join(REPO, "scratchpad", "measure", "out", `fc-${c.id}.md`), md, "utf8");
    rows.push(
      `| ${c.id} | ${((Date.now() - t0) / 1000).toFixed(1)}초 | $${usage.estimatedCostUsd.toFixed(4)} | ${(result.sections ?? []).length}단계 ${md.length}자 | ${result.sources.length}개(첫화면 ${result.sources.filter((s) => isLandingPage(s.url)).length}) | 날조 ${findOwnActivitySentences(md).length} 빈칸 ${countBlanks(md)} | 금지자료 ${banned} 표누락 ${tableMissing} | 무각주수치 ${uncited} 계획각주 ${planCited} 되풀이 ${findRepeatedStatements((result.sections ?? []).map((s) => ({ label: s.label, content: s.markdown }))).length} 경고 ${warn} |`
    );
    console.log(rows[rows.length - 1]);
  } catch (err) {
    rows.push(`| ${c.id} | 실패: ${String(err).slice(0, 60)} | | | | | | |`);
    console.error(c.id, err);
  }
}

console.log("\n| 과제 | 시간 | 비용 | 분량 | 출처 | 정직성 | 안내문 준수 | 근거·문체 |");
console.log("|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(r);
