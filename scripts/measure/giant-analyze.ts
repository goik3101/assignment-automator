// 거대 안내문 한 종의 분석만 N번 돌려 provided_materials와 글 단계 구성을 본다(생성 없음 — 분석 1회 약 $0.005).
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/giant-analyze.ts 사회-05 3 [찾을낱말]
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
const { analyzeAssignment } = await import("@/lib/gemini/analyze");
const { CASES } = await import("./giant-cases.ts");

const [id, nStr, needle] = process.argv.slice(2);
const c = CASES.find((x) => x.id === id)!;
const dir = path.join(REPO, "수행평가 안내문", "거대 수행평가 안내문", `${id.split("-")[0]} 수행평가`, id);
const imgs = fs
  .readdirSync(dir)
  .filter((f) => /\.(png|jpe?g)$/i.test(f))
  .sort()
  .map((f) => ({ base64: fs.readFileSync(path.join(dir, f)).toString("base64"), mimeType: "image/png" }));
for (let i = 0; i < Number(nStr ?? 1); i++) {
  const a = await analyzeAssignment({ imageBase64: imgs[0].base64, imageMimeType: imgs[0].mimeType, extraImages: imgs.slice(1), instructions: c.instructions });
  const core = a.core_task_info;
  const pm = core.provided_materials ?? [];
  console.log(`\n[#${i + 1}] 글 단계 ${core.task_elements.filter((e) => e.type === "text_submission").length}: ${core.task_elements.map((e) => `${e.type === "text_submission" ? "글" : "외부"}:${e.label}`).join(" / ")}`);
  console.log(`  provided_materials ${pm.length}개, 글자 ${pm.join("").length}${needle ? ` | '${needle}' 포함 ${pm.some((m) => m.includes(needle))}` : ""}`);
  for (const m of pm) console.log("   -", m.replace(/\n/g, " ⏎ ").slice(0, needle ? 700 : 160));
}
