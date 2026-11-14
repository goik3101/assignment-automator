// 요약 한 건을 여러 번 돌려 본다. 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/summary-check.ts <결과물.md> [횟수]
import fs from "node:fs";
import path from "node:path";
process.loadEnvFile(path.join(process.cwd(), ".env.local"));
const { makeSummary } = await import("@/lib/study/tools");
const { DEFAULT_STUDY_PREFS } = await import("@/lib/study/prefs");
const { clip } = await import("@/lib/study/context-pure");
const [file, n = "2"] = process.argv.slice(2);
const text = clip(fs.readFileSync(file, "utf8").replace(/\n## 출처[\s\S]*$/, "").trim());
const ctx = { kind: "history" as const, id: "x", title: path.basename(file), subject: "과학", text, sourceLabel: "AI가 작성한 결과물" };
for (let i = 0; i < Number(n); i++) {
  const s = await makeSummary(ctx, DEFAULT_STUDY_PREFS.summary);
  console.log(`\n=== 실행 ${i + 1}\n${s.headline}`);
  s.points.forEach((p) => console.log(`- ${p}`));
  console.log("핵심 용어:");
  s.keyTerms.forEach((k) => console.log(`  · ${k.term}: ${k.meaning}`));
}
