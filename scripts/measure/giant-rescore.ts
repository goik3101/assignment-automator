// 이미 만든 결과물(out/gc-<id>.md)을 새 채점 기준으로 다시 채점만 한다(생성 없음 — 생성 횟수를 아끼려는 용도).
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/giant-rescore.ts 수학-01
import fs from "node:fs";
import path from "node:path";

const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
process.env.SOURCE_STATS_LOG = "off";
const { generate } = await import("@/lib/llm");
const { Type } = await import("@google/genai");
const { CASES } = await import("./giant-cases.ts");

const COMMON_TRUTH = [
  "소제목(항목 이름)이 본문과 줄이 나뉘어 구분된다(소제목과 본문이 한 줄에 이어 붙어 있지 않다)",
  "안내문이 요구한 칸·항목이 하나도 빠지지 않고 모두 있다(안내문에 칸이 여러 개면 모든 칸이 글에 있다)",
  "번역체·기계 말투 없이 한국 고등학생이 쓴 것처럼 자연스럽고 같은 말을 되풀이하지 않는다",
];
const SCHEMA: any = {
  type: Type.OBJECT,
  properties: { results: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { i: { type: Type.INTEGER }, ok: { type: Type.BOOLEAN }, why: { type: Type.STRING } }, required: ["i", "ok", "why"] } } },
  required: ["results"],
};
const RESULTS = path.join(REPO, "scratchpad", "measure", "giant-results.json");

for (const id of process.argv.slice(2)) {
  const c = CASES.find((x) => x.id === id);
  if (!c) continue;
  const md = fs.readFileSync(path.join(REPO, "scratchpad", "measure", "out", `gc-${id}.md`), "utf8");
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
  console.log(`${id} 재채점 ${truth.length - bad.length}/${truth.length}`);
  for (const x of bad) console.log(`   ✗ ${truth[x.i - 1]}\n       → ${x.why.slice(0, 140)}`);
  let all: Record<string, any> = {};
  try {
    all = JSON.parse(fs.readFileSync(RESULTS, "utf8"));
  } catch {}
  if (all[id]) {
    all[id] = { ...all[id], score: `${truth.length - bad.length}/${truth.length}`, got: truth.length - bad.length, total: truth.length, missed: bad.map((x) => ({ item: truth[x.i - 1], why: x.why })) };
    fs.writeFileSync(RESULTS, JSON.stringify(all, null, 2), "utf8");
  }
}
