// screen-dump 폴더의 결과를 giant-cases의 정답 체크리스트(안내문을 읽고 적은 것)로 채점만 한다(생성 없음, 건당 ~$0.01).
// 같은 안내문을 다른 설정으로 돌린 두 폴더를 같은 잣대로 비교할 때 쓴다(규칙 on/off 비교 등).
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/screen-score.ts <폴더이름…>
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

const dirs = process.argv.slice(2);
const totals = new Map<string, { got: number; total: number }>();
const perCase = new Map<string, Map<string, string>>();
for (const d of dirs) {
  const dir = path.join(REPO, "scratchpad", "measure", d);
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".md")).sort()) {
    const id = f.replace(/\.md$/, "");
    const c = CASES.find((x) => x.id === id);
    if (!c) continue;
    const md = fs
      .readFileSync(path.join(dir, f), "utf8")
      .split("\n")
      .filter((l) => !l.startsWith("▣") && !l.startsWith("분석 ") && !l.startsWith("학생 지침") && !l.startsWith("# "))
      .join("\n");
    const truth = [...c.truth, ...COMMON_TRUTH];
    const res = await generate({
      label: "screenScore",
      role: "main",
      prompt:
        "학생이 제출할 글이 안내문 조건을 지켰는지 조건마다 엄격하게 판정해줘. ok=true는 [글]에서 그 조건을 충족하는 구절을 실제로 찾아 인용할 수 있을 때만 준다. why에 그 구절을 25자 안팎으로 글에서 그대로 인용해라. 인용할 구절이 없으면 ok=false이고 why에 무엇이 빠졌는지 적어라. 조건이 '~하지 않았다'는 부정형이면 어긴 곳이 없을 때 ok=true. '=== 카드' 줄은 화면의 카드 구분선이고 '## 출처' 목록은 우리가 단 검색 출처다.\n\n[조건]\n" +
        truth.map((t, i) => `${i + 1}. ${t}`).join("\n") +
        `\n\n[글]\n${md}`,
      schema: SCHEMA,
    });
    const r = (JSON.parse(res.text ?? "{}").results ?? []) as { i: number; ok: boolean }[];
    const got = r.filter((x) => x.ok).length;
    const t = totals.get(d) ?? { got: 0, total: 0 };
    t.got += got;
    t.total += truth.length;
    totals.set(d, t);
    const m = perCase.get(id) ?? new Map();
    m.set(d, `${got}/${truth.length}`);
    perCase.set(id, m);
  }
}
for (const [id, m] of perCase) console.log(id.padEnd(10), dirs.map((d) => `${d}=${m.get(d) ?? "-"}`).join("  "));
for (const [d, t] of totals) console.log(`합계 ${d}: ${t.got}/${t.total} (${((t.got / t.total) * 100).toFixed(1)}%)`);
