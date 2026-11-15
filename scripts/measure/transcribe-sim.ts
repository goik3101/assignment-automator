// 같은 안내문을 두 번 전사한 글끼리, 다른 안내문 글끼리의 지문 유사도를 재서 재사용 문턱을 정한다(분석 캐시용).
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/transcribe-sim.ts 과학-01 사회-02 …
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
process.env.SOURCE_STATS_LOG = "off";
const { generate } = await import("@/lib/llm");
const { noticeSignature, signatureSimilarity } = await import("@/lib/analysis-cache/signature");
const ROOT = path.join(REPO, "수행평가 안내문", "거대 수행평가 안내문");
const ids = process.argv.slice(2);
const PROMPT = "사진에 적힌 글을 **요약하지 말고 그대로 옮겨 써라**(OCR처럼). 사진이 여러 장이면 순서대로 이어 붙인다. 표는 칸 내용을 '|'로 구분해 한 줄씩 옮긴다. 학생이 채울 빈 칸은 칸 이름만 옮기고(빈 줄은 '___'), 손글씨 예시·도장·학교 로고처럼 글이 아닌 것은 건너뛴다. 읽을 수 없는 글자는 '?'로 둔다. 네가 판단하거나 보충한 말은 한 글자도 넣지 말고, 글이 많으면 2,000자까지만 쓴다. 옮긴 글만 출력한다.";
const sigs: Record<string, (number[] | null)[]> = {};
for (const id of ids) {
  const dir = path.join(ROOT, `${id.split("-")[0]} 수행평가`, id);
  const imgs = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().map((f) => ({ image: { base64: fs.readFileSync(path.join(dir, f)).toString("base64"), mimeType: /\.png$/i.test(f) ? "image/png" : "image/jpeg" } }));
  const runs = await Promise.all([0, 1].map(() => generate({ label: "sim", role: "lite", effort: "low", prompt: [...imgs, { text: PROMPT }] as never }).then((r) => (r.text ?? "").slice(0, 2500))));
  sigs[id] = runs.map((t) => noticeSignature(t));
  console.log(id, "전사 길이", runs.map((t) => t.length).join("/"));
}
const same: number[] = [];
const diff: number[] = [];
for (const a of ids) {
  const [x, y] = sigs[a];
  if (x && y) same.push(signatureSimilarity(x, y));
  for (const b of ids) if (a < b) for (const p of sigs[a]) for (const q of sigs[b]) if (p && q) diff.push(signatureSimilarity(p, q));
}
const f = (v: number[]) => `n=${v.length} 최소 ${Math.min(...v).toFixed(2)} 중앙 ${[...v].sort((a, b) => a - b)[Math.floor(v.length / 2)].toFixed(2)} 최대 ${Math.max(...v).toFixed(2)}`;
console.log("같은 안내문 두 번:", f(same));
console.log("다른 안내문끼리:", f(diff));
