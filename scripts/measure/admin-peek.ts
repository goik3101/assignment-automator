// 분석 결과의 행정 정보(administrative_info)와 요구사항에서 시간·분량 단서를 찾는다 — 손글씨 예산 관문이 무엇을 볼 수 있는지 확인용.
import fs from "node:fs";
import path from "node:path";
process.loadEnvFile(path.join(process.cwd(), ".env.local"));
const { analyzeAssignment } = await import("@/lib/gemini/analyze");
for (const id of process.argv.slice(2)) {
  const dir = path.join(process.cwd(), "수행평가 안내문", "거대 수행평가 안내문", `${id.split("-")[0]} 수행평가`, id);
  const imgs = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().map((f) => ({ base64: fs.readFileSync(path.join(dir, f)).toString("base64"), mimeType: "image/png" }));
  const a = await analyzeAssignment({ imageBase64: imgs[0].base64, imageMimeType: imgs[0].mimeType, extraImages: imgs.slice(1) });
  console.log(`== ${id}\nadmin: ${JSON.stringify(a.administrative_info)}`);
  const core = JSON.stringify(a.core_task_info);
  for (const k of ["40분", "50분", "45분", "수업 시간", "시간 엄수", "손", "당일"]) { const i = core.indexOf(k); if (i >= 0) console.log(`core에 '${k}': …${core.slice(Math.max(0, i - 30), i + 40)}…`); }
}
