// 같은 안내문 사진을 여러 번 분석해, 분석 결과 위에 올라탄 규칙들이 얼마나 뒤집히는지 센다.
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/analyze-stability.ts [사례id] [횟수]
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
process.env.SOURCE_STATS_LOG = "off";

const { analyzeAssignment } = await import("@/lib/gemini/analyze");
const { wantsBriefScenes, requirementsForElement } = await import("@/lib/essay/form-requirements");
const { needsSubjectSelection } = await import("@/lib/selection/selection-need");
const { visualPolicy, needsDataTable } = await import("@/lib/essay/data-visual");
const { planEvidence } = await import("@/lib/essay/evidence-slots");
const { compoundItems } = await import("@/lib/essay/compound-items");
const { stepWaves } = await import("@/lib/essay/step-order");

const IMG = path.join(REPO, "수행평가 안내문");
const CASES: Record<string, string[]> = {
  "국어(발표)": ["국어 -1/KakaoTalk_20260526_213359166.jpg"],
  "신문(역사)": ["역사-1 - 복사본/KakaoTalk_20261021_232340155_02.jpg", "역사-1 - 복사본/KakaoTalk_20261021_232340155_01.jpg"],
  "과학(산·염기)": ["KakaoTalk_20260928_165015557_01 - 복사본.jpg"],
};
const id = process.argv[2] ?? "국어(발표)";
const n = Number(process.argv[3] ?? 6);
const imgs = CASES[id].map((rel) => ({ base64: fs.readFileSync(path.join(IMG, rel)).toString("base64"), mimeType: "image/jpeg" }));

const rows: Record<string, string>[] = [];
for (let i = 0; i < n; i++) {
  const t0 = Date.now();
  const a = await analyzeAssignment({ imageBase64: imgs[0].base64, imageMimeType: imgs[0].mimeType, extraImages: imgs.slice(1) });
  const c = a.core_task_info as any;
  const els = c.task_elements.filter((e: any) => e.type === "text_submission");
  const texts = [...c.requirements, c.writing_guide ?? "", ...c.task_elements.map((e: any) => e.description)];
  const counts = els.flatMap((el: any) =>
    requirementsForElement(el, c.requirements, c.writing_guide, c.task_elements.map((x: any) => x.label))
      .map((r: any) => `${r.word}${r.min ?? ""}~${r.max ?? ""}`)
  );
  const pol = visualPolicy(texts);
  rows.push({
    "초": ((Date.now() - t0) / 1000).toFixed(1),
    "단계수": String(c.task_elements.length),
    "글단계": String(els.length),
    "단계이름": c.task_elements.map((e: any) => e.label).join("/"),
    "요구": String(c.requirements.length),
    "간단히표시": String(wantsBriefScenes(texts)),
    "대상선정": String(needsSubjectSelection(c)),
    "개수조건": counts.join(",") || "-",
    "허용자료": (pol.allowed ?? []).join(",") || "-",
    "표요구": String(els.some((el: any) => needsDataTable(el, c.requirements, c.writing_guide, els.length === 1))),
    "근거개수": String(planEvidence(c, undefined).slots),
    "필수항목": els.map((e: any) => (e.required_items ?? []).length).join("+") || "-",
    "항목이름": els.flatMap((e: any) => e.required_items ?? []).slice(0, 4).join("|") || "-",
    "나열항목": String(compoundItems(els.flatMap((el: any) => el.required_items ?? [])).length),
    "단계순서": stepWaves(els.map((e: any) => ({ label: e.label, description: e.description }))).map((w: string[]) => w.join("+")).join("→"),
  });
  console.log(`${i + 1}회 ${JSON.stringify(rows[rows.length - 1])}`);
}

console.log(`\n### ${id} ${n}회 — 뒤집힌 항목`);
const keys = Object.keys(rows[0]).filter((k) => k !== "초");
for (const k of keys) {
  const vals = rows.map((r) => r[k]);
  const uniq = [...new Set(vals)];
  const mark = uniq.length === 1 ? "고정" : `**${uniq.length}가지**`;
  console.log(`  ${k.padEnd(10)} ${mark}  ${uniq.map((u) => `${u}(${vals.filter((v) => v === u).length})`).join("  ")}`);
}
