// "거대 수행평가 안내문" 30종 일괄 점검: 안내문 사진 → analyze → 생성(글/계획) → 정답 체크리스트 채점 + 시간·분량·출처 측정.
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/giant-check.ts 과학-01 사회-02 ...   (id 없으면 전부)
// 생성은 서버 경로가 아니라 generateEssay/generatePlan을 직접 부르므로 쏠림 억제·임베딩 저장에 영향이 없다(CLAUDE.md 2026-11-02).
import fs from "node:fs";
import path from "node:path";

const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
process.env.SOURCE_STATS_LOG = "off";

const { analyzeAssignment } = await import("@/lib/gemini/analyze");
const { generateEssay } = await import("@/lib/gemini/generate-essay");
const { generatePlan } = await import("@/lib/gemini/generate-plan");
const { withLlmTrace, generate } = await import("@/lib/llm");
const { summarizeTrace } = await import("@/lib/llm/usage");
const { Type } = await import("@google/genai");
const { findOwnActivitySentences, countBlanks } = await import("@/lib/essay/own-activity");
const { visualPolicy, findBannedVisuals } = await import("@/lib/essay/data-visual");
const { isLandingPage } = await import("@/lib/essay/research-notes");
const { findRepeatedStatements } = await import("@/lib/essay/repetition");
const { submittedLength } = await import("@/lib/essay/submitted-length");
const { CASES } = await import("./giant-cases.ts");

// 모든 과제에 붙는 글 품질 조건(안내문 조건이 아니라 우리 제품 기준). 개별 체크리스트와 따로 센다.
const COMMON_TRUTH = [
  "소제목(항목 이름)이 본문과 줄이 나뉘어 구분된다(소제목과 본문이 한 줄에 이어 붙어 있지 않다)",
  "안내문이 요구한 칸·항목이 하나도 빠지지 않고 모두 있다(안내문에 칸이 여러 개면 모든 칸이 글에 있다)",
  "번역체·기계 말투 없이 한국 고등학생이 쓴 것처럼 자연스럽고 같은 말을 되풀이하지 않는다",
];

const ROOT = path.join(REPO, "수행평가 안내문", "거대 수행평가 안내문");
const OUT = path.join(REPO, "scratchpad", "measure", "out");
const RESULTS = path.join(REPO, "scratchpad", "measure", "giant-results.json");
fs.mkdirSync(OUT, { recursive: true });

function imagesFor(id: string): string[] {
  const subject = id.split("-")[0];
  const dir = path.join(ROOT, `${subject} 수행평가`, id);
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}

const SCHEMA: any = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { i: { type: Type.INTEGER }, ok: { type: Type.BOOLEAN }, why: { type: Type.STRING } }, required: ["i", "ok", "why"] },
    },
  },
  required: ["results"],
};

const sentences = (t: string) =>
  t
    .split("\n")
    .filter((l) => !/^\s*(?:#|\|)/.test(l))
    .flatMap((l) => l.split(/(?<=[.!?。](?:\[\d+\])*)\s+/))
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((s) => s.length >= 8);

function loadResults(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(RESULTS, "utf8"));
  } catch {
    return {};
  }
}

const only = process.argv.slice(2);
const rows: string[] = [];

for (const c of CASES) {
  if (only.length && !only.includes(c.id)) continue;
  const imgs = imagesFor(c.id).map((p) => ({ base64: fs.readFileSync(p).toString("base64"), mimeType: /\.png$/i.test(p) ? "image/png" : "image/jpeg" }));
  console.log(`\n=== ${c.id} ${c.name} (사진 ${imgs.length}장)`);
  try {
    // 1) 분석
    const a0 = Date.now();
    const analysis = await analyzeAssignment({ imageBase64: imgs[0].base64, imageMimeType: imgs[0].mimeType, extraImages: imgs.slice(1), instructions: c.instructions });
    const analyzeSec = (Date.now() - a0) / 1000;
    const core = analysis.core_task_info;
    const subject = analysis.subject;
    fs.writeFileSync(path.join(OUT, `an-giant-${c.id}.json`), JSON.stringify({ subject, core_task_info: core }, null, 2), "utf8");
    const textEls = core.task_elements.filter((e) => e.type === "text_submission");
    const extEls = core.task_elements.filter((e) => e.type !== "text_submission");
    console.log(`  분석 ${analyzeSec.toFixed(1)}초 | 과목 ${subject} | 글 단계 ${textEls.length}: ${textEls.map((e) => e.label).join(" / ")} | 외부 제작 ${extEls.length}: ${extEls.map((e) => e.label).join(" / ")}`);

    // 2) 생성 (앱이 하는 것처럼 글 단계는 generateEssay, 외부 제작 단계는 generatePlan)
    const g0 = Date.now();
    const { essay, plan, usage } = await withLlmTrace(`giant:${c.id}`, async (trace) => {
      let essay: Awaited<ReturnType<typeof generateEssay>> | null = null;
      let plan: Awaited<ReturnType<typeof generatePlan>> | null = null;
      if (textEls.length) essay = await generateEssay({ subject, coreTaskInfo: core, instructions: c.instructions, selection: { history: [] } });
      if (extEls.length) {
        const planCore = { ...core, task_elements: extEls };
        plan = await generatePlan({ subject, coreTaskInfo: planCore, instructions: c.instructions });
      }
      return { essay, plan, usage: summarizeTrace(trace) };
    });
    const genSec = (Date.now() - g0) / 1000;

    const parts: string[] = [];
    const sources: { n: number; title: string; url: string; tier?: string; url_valid: boolean | null }[] = [];
    let sections: { label: string; markdown: string; noSourcesWarning?: boolean; lengthWarning?: unknown; structureWarning?: unknown }[] = [];
    if (essay && essay.type === "essay") {
      parts.push(essay.markdown);
      sources.push(...essay.sources);
      sections = (essay.sections ?? []) as typeof sections;
      const notes = [
        ...(essay.productionNotes ? [essay.productionNotes] : []),
        ...(essay.sections ?? []).filter((s) => s.productionNotes?.trim()).map((s) => `**${s.label}**: ${s.productionNotes}`),
      ].filter((t) => t.trim());
      if (notes.length) parts.push(["## 제작 참고", ...notes].join("\n"));
    } else if (essay) {
      parts.push(`(생성 실패: ${essay.type})`);
    }
    if (plan && plan.type === "plan") {
      parts.push("## [외부 제작 산출물]\n" + plan.content);
      parts.push("### 학생이 직접 할 일\n" + plan.productionSteps.map((s) => `${s.order}. ${s.task} (${s.estimated_minutes}분)`).join("\n"));
      sources.push(...plan.sources.filter((s) => !sources.some((x) => x.url === s.url)));
      sections.push({ label: "외부 제작", markdown: plan.content });
    } else if (plan) {
      parts.push(`(계획 생성 실패: ${plan.type})`);
    }
    // 화면은 출처 목록을 본문과 따로 보여 준다 — 저장 파일에도 붙여야 채점이 학생이 보는 것과 같다(final-check 주석 참고).
    const sourceList = sources.length ? ["", "## 출처", ...sources.map((s) => `[${s.n}] ${s.title} — ${s.url}`)].join("\n") : "";
    const md = parts.join("\n\n") + "\n" + sourceList;
    fs.writeFileSync(path.join(OUT, `gc-${c.id}.md`), md, "utf8");

    // 3) 측정: 분량·출처·정직성
    const body = parts.join("\n\n");
    const policy = visualPolicy([...core.requirements, core.writing_guide ?? "", ...core.task_elements.map((e) => e.description)]);
    const banned = sections.reduce((n, s) => n + findBannedVisuals(s.markdown, policy).length, 0);
    const uncited = sentences(body).filter((s) => /\d{3,4}년|\d+(?:\.\d+)?\s*%|\d+\s*[㎍μu]g?|\d{1,3},\d{3}/.test(s) && !/\[\d+\]/.test(s) && !/https?:/.test(s)).length;
    const repeated = findRepeatedStatements(sections.map((s) => ({ label: s.label, content: s.markdown }))).length;
    const own = findOwnActivitySentences(body).length;
    const blanks = countBlanks(body);
    const warns = sections.filter((s) => s.noSourcesWarning || s.structureWarning || s.lengthWarning).length;
    const lens = sections.map((s) => `${s.label}=${submittedLength(s.markdown)}`).join(", ");
    const totalLen = submittedLength(body);
    const tiers: Record<string, number> = {};
    for (const s of sources) tiers[s.tier ?? "미검증"] = (tiers[s.tier ?? "미검증"] ?? 0) + 1;
    const badLinks = sources.filter((s) => s.url_valid === false).length;
    const landing = sources.filter((s) => isLandingPage(s.url)).length;

    // 4) 정답 체크리스트 채점
    // 2026-11-14: 첫 실행에서 시험지의 "소감문" 칸이 통째로 빠진 글이 9/9로 나왔다 — 채점이 후했다.
    // 그래서 ok=true는 글에서 그 조건을 충족하는 구절을 **그대로 인용할 수 있을 때만** 주게 한다.
    const truth = [...c.truth, ...COMMON_TRUTH];
    const tres = await generate({
      label: "truth",
      role: "main",
      prompt:
        "학생이 제출할 글이 안내문 조건을 지켰는지 조건마다 엄격하게 판정해줘. ok=true는 [글]에서 그 조건을 충족하는 구절을 실제로 찾아 인용할 수 있을 때만 준다. why에 그 구절을 25자 안팎으로 **글에서 그대로** 인용해라. 인용할 구절이 없으면(조건의 내용이 글에 없거나 일부만 있거나 어겼으면) ok=false이고 why에 무엇이 빠졌는지 적어라. 조건이 '~하지 않았다'는 부정형이면 글을 훑어 어긴 곳이 없을 때 ok=true, 어긴 구절이 있으면 인용해 false. 맨 아래 '## 출처' 목록은 우리가 단 검색 출처이니 기사 서지와 혼동하지 말 것.\n\n[조건]\n" +
        truth.map((t, i) => `${i + 1}. ${t}`).join("\n") +
        `\n\n[글]\n${md}`,
      schema: SCHEMA,
    });
    const r = (JSON.parse(tres.text ?? "{}").results ?? []) as { i: number; ok: boolean; why: string }[];
    const bad = r.filter((x) => !x.ok);
    const score = `${truth.length - bad.length}/${truth.length}`;
    console.log(`  채점 ${score}${r.length !== truth.length ? ` (판정 ${r.length}개 — 채점 누락 있음)` : ""}`);
    for (const x of bad) console.log(`   ✗ ${truth[x.i - 1] ?? `#${x.i}`}\n       → ${x.why.slice(0, 120)}`);
    // 호출별 시간(조사·글쓰기·보완이 어디서 시간을 쓰는지) — 30초 목표를 못 맞춘 과제의 원인을 보려는 것.
    const byLabel = Object.entries(usage.byLabel).sort((x, y) => y[1].ms - x[1].ms);
    console.log(`  호출 ${usage.calls}건 | ` + byLabel.slice(0, 6).map(([l, v]) => `${l.replace("generateEssay:", "")} ${(v.ms / 1000).toFixed(1)}초×${v.calls}`).join(" · "));
    console.log(`  생성 ${genSec.toFixed(1)}초 $${usage.estimatedCostUsd.toFixed(4)} | 분량 ${totalLen}자 (${lens}) | 출처 ${sources.length}개 ${JSON.stringify(tiers)} 무효링크 ${badLinks} 첫화면 ${landing} | 날조 ${own} 빈칸 ${blanks} 금지자료 ${banned} 무각주수치 ${uncited} 되풀이 ${repeated} 경고 ${warns}`);

    const all = loadResults();
    all[c.id] = {
      name: c.name,
      at: new Date().toISOString(),
      analyzeSec,
      genSec,
      costUsd: usage.estimatedCostUsd,
      calls: Object.fromEntries(Object.entries(usage.byLabel).map(([l, v]) => [l, { sec: +(v.ms / 1000).toFixed(1), n: v.calls }])),
      textSteps: textEls.map((e) => e.label),
      externalSteps: extEls.map((e) => e.label),
      score,
      got: truth.length - bad.length,
      total: truth.length,
      missed: bad.map((x) => ({ item: truth[x.i - 1], why: x.why })),
      chars: totalLen,
      sectionLengths: lens,
      sources: { n: sources.length, tiers, badLinks, landing },
      defects: { own, blanks, banned, uncited, repeated, warns },
    };
    fs.writeFileSync(RESULTS, JSON.stringify(all, null, 2), "utf8");
    rows.push(`| ${c.id} | ${analyzeSec.toFixed(0)} | ${genSec.toFixed(1)} | $${usage.estimatedCostUsd.toFixed(3)} | ${totalLen} | ${sources.length}(${JSON.stringify(tiers).replace(/"/g, "")}) | ${score} | 날조${own} 빈칸${blanks} 금지${banned} 무각주${uncited} 반복${repeated} |`);
  } catch (err) {
    console.error(`  ✗ ${c.id} 실패:`, err);
    rows.push(`| ${c.id} | 실패: ${String(err).slice(0, 80)} | | | | | | |`);
  }
}

console.log("\n| 과제 | 분석초 | 생성초 | 비용 | 분량 | 출처 | 채점 | 결함 |");
console.log("|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(r);
