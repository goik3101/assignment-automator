// 학생 화면에 나가는 것을 그대로 덤프한다(점수 없음): 안내문 사진 → 분석 → 생성 → "화면 텍스트".
// 점수판은 글 내용만 채점해서 경고 배너·제작 참고·빈 소제목 같은 화면 결함을 못 봤다(2026-11-16 결과물34).
// 이 도구는 그 화면 필드를 전부 찍고, 사람이(또는 내가) 안내문 사진과 나란히 읽게 한다.
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/screen-dump.ts 역사-01 사회-03 ...
// 생성은 generateEssay/generatePlan 직접 호출이라 쏠림 억제·임베딩 저장에 영향이 없다.
import fs from "node:fs";
import path from "node:path";

const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
process.env.SOURCE_STATS_LOG = "off";

const { analyzeAssignment } = await import("@/lib/gemini/analyze");
const { generateEssay } = await import("@/lib/gemini/generate-essay");
const { generatePlan } = await import("@/lib/gemini/generate-plan");
const { withLlmTrace } = await import("@/lib/llm");
const { summarizeTrace } = await import("@/lib/llm/usage");
const { CASES } = await import("./giant-cases.ts");

const ROOT = path.join(REPO, "수행평가 안내문", "거대 수행평가 안내문");
const OUT = path.join(REPO, "scratchpad", "measure", process.env.SD_DIR ?? "screen");
fs.mkdirSync(OUT, { recursive: true });

function imagesFor(id: string): string[] {
  const dir = path.join(ROOT, `${id.split("-")[0]} 수행평가`, id);
  return fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().map((f) => path.join(dir, f));
}

const only = process.argv.slice(2);
for (const c of CASES) {
  if (only.length && !only.includes(c.id)) continue;
  const imgs = imagesFor(c.id).map((p) => ({ base64: fs.readFileSync(p).toString("base64"), mimeType: /\.png$/i.test(p) ? "image/png" : "image/jpeg" }));
  const t0 = Date.now();
  try {
    const a = await analyzeAssignment({ imageBase64: imgs[0].base64, imageMimeType: imgs[0].mimeType, extraImages: imgs.slice(1), instructions: c.instructions });
    const analyzeSec = (Date.now() - t0) / 1000;
    const core = a.core_task_info;
    fs.writeFileSync(path.join(OUT, `${c.id}${process.env.SD_TAG ?? ""}.analysis.json`), JSON.stringify(core, null, 1), "utf8");
    const textEls = core.task_elements.filter((e) => e.type === "text_submission");
    const extEls = core.task_elements.filter((e) => e.type !== "text_submission");
    const g0 = Date.now();
    const { essay, plan, usage } = await withLlmTrace(`screen:${c.id}`, async (trace) => {
      const essay = textEls.length ? await generateEssay({ subject: a.subject, coreTaskInfo: core, instructions: c.instructions, selection: { history: [] } }) : null;
      const plan = extEls.length ? await generatePlan({ subject: a.subject, coreTaskInfo: { ...core, task_elements: extEls }, instructions: c.instructions }) : null;
      return { essay, plan, usage: summarizeTrace(trace) };
    });
    const genSec = (Date.now() - g0) / 1000;
    const out: string[] = [];
    out.push(`# ${c.id} ${c.name}  (분석 ${analyzeSec.toFixed(1)}초 · 생성 ${genSec.toFixed(1)}초 · $${usage.estimatedCostUsd.toFixed(4)})`);
    out.push(`학생 지침: ${c.instructions ?? "(없음)"}`);
    out.push(`분석 단계: ${core.task_elements.map((e) => `${e.label}[${e.type}]`).join(" / ")}`);
    out.push(`분석 요구사항: ${JSON.stringify(core.requirements)}`);
    if (essay && essay.type === "essay") {
      if (essay.noSourcesWarning) out.push("▣ 맨 위 배너: 이 내용은 검색으로 검증되지 않았어요");
      if (essay.structureWarning) out.push(`▣ 전체 구조 경고: ${essay.structureWarning}`);
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
      out.push(`\n전체 출처 ${essay.sources.length}개: ${essay.sources.map((x) => `[${x.n}] ${x.title}`).join(" | ")}`);
    } else if (essay) out.push(`(생성 실패: ${essay.type})`);
    if (plan && plan.type === "plan") {
      out.push("\n==================== 외부 제작 계획 ====================");
      out.push(plan.content);
      out.push(plan.productionSteps.map((s) => `${s.order}. ${s.task} (${s.estimated_minutes}분)`).join("\n"));
    } else if (plan) out.push(`(계획 생성 실패: ${plan.type})`);
    fs.writeFileSync(path.join(OUT, `${c.id}${process.env.SD_TAG ?? ""}.md`), out.join("\n"), "utf8");
    console.log(`${c.id}: ok 분석 ${analyzeSec.toFixed(1)}s 생성 ${genSec.toFixed(1)}s`);
  } catch (e) {
    console.log(`${c.id}: 실패 ${(e as Error).message}`);
  }
}
