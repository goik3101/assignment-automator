// 안내문 분석 1회의 시간·출력 토큰을 NOTICE_TEXT(원문 전사) 켬/끔으로 비교한다. 분석만 부르므로 1회 약 $0.005.
// 사용: NOTICE_TEXT=on|off node --import ./scripts/measure/loader/register.mjs scripts/measure/analyze-timing.ts 사회-02 역사-01 ...
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
const { analyzeAssignment } = await import("@/lib/gemini/analyze");
const { withLlmTrace } = await import("@/lib/llm");
const { summarizeTrace } = await import("@/lib/llm/usage");

for (const id of process.argv.slice(2)) {
  const dir = path.join(REPO, "수행평가 안내문", "거대 수행평가 안내문", `${id.split("-")[0]} 수행평가`, id);
  const imgs = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().map((f) => ({ base64: fs.readFileSync(path.join(dir, f)).toString("base64"), mimeType: /\.png$/i.test(f) ? "image/png" : "image/jpeg" }));
  const t0 = Date.now();
  const { u, res } = await withLlmTrace(`timing:${id}`, async (trace) => {
    const res = await analyzeAssignment({ imageBase64: imgs[0].base64, imageMimeType: imgs[0].mimeType, extraImages: imgs.slice(1) });
    return { u: summarizeTrace(trace), res };
  });
  const sec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log("  단계: " + res.core_task_info.task_elements.map((e) => `${e.label}[${(e.required_items ?? []).join("/")}]`).join(" || "));
  console.log(`${process.env.NOTICE_TEXT ?? "on"}\t${id}\t${sec}초\t호출 ${u.calls}건\t${JSON.stringify(u).slice(0, 260)}`);
}
