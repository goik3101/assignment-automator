// "ChatGPT에 사진 넣고 쓰라고 한 것"을 거대 안내문 34종 전부에 돌려 screen-score와 같은 체크리스트로 채점할 수 있게 저장한다.
// 우리 층(분석·규칙·조사·후처리)은 하나도 없다: 사진 + 학생 지침 + "안내문 조건은 다 지켜 줘" 한 줄 → 모델 호출 1건.
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/bare34.ts [id…]   → scratchpad/measure/screen_bare/<id>.md
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
process.env.SOURCE_STATS_LOG = "off";
const { generate } = await import("@/lib/llm");
const { CASES } = await import("./giant-cases.ts");
const ROOT = path.join(REPO, "수행평가 안내문", "거대 수행평가 안내문");
const OUT = path.join(REPO, "scratchpad", "measure", "screen_bare");
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
for (const c of CASES) {
  if (only.length && !only.includes(c.id)) continue;
  const dir = path.join(ROOT, `${c.id.split("-")[0]} 수행평가`, c.id);
  const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
  const parts: unknown[] = files.map((f) => ({ image: { base64: fs.readFileSync(path.join(dir, f)).toString("base64"), mimeType: /\.png$/i.test(f) ? "image/png" : "image/jpeg" } }));
  parts.push({ text: ["이 수행평가 안내문을 보고, 내가 그대로 제출할 수 있는 결과물을 써 줘.", c.instructions ? `참고: ${c.instructions}` : "", "안내문에 있는 조건은 다 지켜 줘."].filter(Boolean).join("\n") });
  const t0 = Date.now();
  try {
    const r = await generate({ label: "bare34", role: "write", prompt: parts as never, search: { maxCalls: 3 }, effort: "low" });
    const secs = (Date.now() - t0) / 1000;
    fs.writeFileSync(path.join(OUT, `${c.id}.md`), `# ${c.id}  (생성 ${secs.toFixed(1)}초)\n${r.text}`, "utf8");
    console.log(`${c.id}: ok ${secs.toFixed(1)}s ${r.text.length}자`);
  } catch (e) {
    console.log(`${c.id}: 실패 ${(e as Error).message}`);
  }
}
