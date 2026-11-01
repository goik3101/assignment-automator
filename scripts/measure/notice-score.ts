// 사람이 쓴 정답 체크리스트 **없이**, 안내문 사진 자체로 결과물을 채점한다.
//
// 왜: truth.ts는 내가 손으로 읽어 적은 체크리스트로 채점한다. 그래서 (1) 처음 보는 안내문은 아예 못 재고
// (2) 내 체크리스트가 틀리면 멀쩡한 결과물이 깎인다(2026-11-03 하루에만 네 번: 출처 목록 누락, 제작 참고 누락,
// 만평/광고 택일, 부정형 항목). 다른 사용자가 완전히 다른 수행평가를 들고 와도 품질을 재려면
// **안내문에서 직접** 조건을 뽑아 채점해야 한다.
//
// 모델에게 두 가지를 따로 시킨다: ① 사진에서 "학생이 지켜야 할 조건"만 뽑기 ② 그 조건마다 결과물 판정.
// 조건 뽑기와 판정을 한 번에 시키면 모델이 자기가 만든 느슨한 조건에 스스로 통과를 준다.
//
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/notice-score.ts <결과물.md> <사진...>
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
process.env.SOURCE_STATS_LOG = "off";
const { generate } = await import("@/lib/llm");
const { Type } = await import("@google/genai");

const [outFile, ...imgs] = process.argv.slice(2);
if (!outFile || imgs.length === 0) {
  console.log("사용: notice-score.ts <결과물.md> <안내문사진...>");
  process.exit(1);
}
const md = fs.readFileSync(path.join(REPO, "scratchpad/measure/out", outFile), "utf8");
const images = imgs.map((f) => ({ base64: fs.readFileSync(path.join(REPO, "수행평가 안내문", f)).toString("base64"), mimeType: "image/jpeg" }));

const LIST: never = {
  type: Type.OBJECT,
  properties: {
    conditions: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { text: { type: Type.STRING }, why: { type: Type.STRING } }, required: ["text"] },
    },
  },
  required: ["conditions"],
} as never;

const listed = await generate({
  label: "notice-score:conditions",
  role: "analyze",
  schema: LIST,
  prompt: [
    ...images.map((im) => ({ image: im })),
    { text:
    "이 수행평가 안내문 사진에서 **학생이 제출할 글이 지켜야 할 조건**만 빠짐없이 뽑아줘.\n" +
    "- 글만 봐서 지켰는지 알 수 있는 것만 넣을 것(배점·제출 기한·수업 운영·시험 대형·준비물은 빼라).\n" +
    "- 안내문에 적힌 말을 그대로 쓰고, 안내문에 없는 조건을 지어내지 말 것.\n" +
    "- '또는'으로 고르게 한 조건은 '둘 중 하나를 완성했는가'로 적을 것.\n" +
    "- why에는 안내문의 어느 문구에서 가져왔는지 한 구절로." },
  ],
});
const conditions = (JSON.parse(listed.text ?? "{}").conditions ?? []) as { text: string; why?: string }[];

const VERDICT: never = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { i: { type: Type.INTEGER }, ok: { type: Type.BOOLEAN }, why: { type: Type.STRING } }, required: ["i", "ok", "why"] },
    },
  },
  required: ["results"],
} as never;

const judged = await generate({
  label: "notice-score:verdict",
  role: "main",
  schema: VERDICT,
  prompt:
    "학생이 제출할 글이 아래 조건을 지켰는지 조건마다 판정해줘. 글에 실제로 있으면 ok=true, 없거나 어겼으면 false.\n" +
    "글 맨 아래 '## 출처'와 '## 제작 참고'도 학생이 받는 내용이니 함께 보고 판정할 것.\n" +
    "안내문이 'A 또는 B 중 하나'를 고르게 한 경우, 학생이 A를 골랐다면 B에만 해당하는 조건은 **ok=true**로 두고 why에 '해당 없음'이라고 적을 것 — 고르지 않은 쪽을 못 지켰다고 하면 안 된다.\n" +
    "학생이 직접 준비할 사진·그림을 '제작 참고'에서 무엇을 준비하라고 안내했다면 그 조건은 충족으로 볼 것(AI가 사진을 붙여 줄 수는 없다).\n\n[조건]\n" +
    conditions.map((c, i) => `${i + 1}. ${c.text}`).join("\n") +
    `\n\n[글]\n${md}`,
});
const r = (JSON.parse(judged.text ?? "{}").results ?? []) as { i: number; ok: boolean; why: string }[];
const bad = r.filter((x) => !x.ok);
console.log(`\n## ${outFile} — 안내문에서 뽑은 조건 ${conditions.length}개 중 ${r.length - bad.length}개 충족`);
for (const c of conditions) console.log(`   · ${c.text}${c.why ? `  (${c.why.slice(0, 40)})` : ""}`);
console.log("");
for (const x of bad) console.log(`   ✗ ${conditions[x.i - 1]?.text}\n       ${x.why.slice(0, 140)}`);
