// 개념 이해(요약+암기 뼈대)만 돌려 눈으로 읽는 점검. 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/study-understand.ts 과학-02 사회-03
import fs from "node:fs";
import path from "node:path";

const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
const { makeSummary } = await import("@/lib/study/tools");
const { DEFAULT_STUDY_PREFS } = await import("@/lib/study/prefs");
const { clip } = await import("@/lib/study/context-pure");

for (const id of process.argv.slice(2)) {
  const file = path.join(REPO, "scratchpad", "measure", "out", `gc-${id}.md`);
  const text = clip(fs.readFileSync(file, "utf8").replace(/\n## 출처[\s\S]*$/, "").trim());
  const ctx = { kind: "history" as const, id: "00000000-0000-0000-0000-000000000000", title: id, subject: id.split("-")[0], text, sourceLabel: "AI가 작성한 결과물" };
  const t0 = Date.now();
  const s = await makeSummary(ctx, DEFAULT_STUDY_PREFS.summary);
  console.log(`\n===== ${id} (${((Date.now() - t0) / 1000).toFixed(1)}초, 자료 ${text.length}자)\n${s.headline}`);
  console.log("-- 개념");
  s.keyTerms.forEach((k) => console.log(`* ${k.term}: ${k.meaning} / 결과물에서: ${k.inTask ?? ""}`));
  console.log("-- 뼈대");
  s.skeleton.forEach((b, i) => console.log(`${i + 1}. [${b.box}] ${b.line}  ◀ ${b.keywords.join(" · ")}`));
}
