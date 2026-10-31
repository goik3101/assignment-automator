// 안내문 사진을 사람이 직접 읽어 적은 "정답 체크리스트"로 결과물을 채점한다.
// analyze가 요약한 조건이 아니라 안내문 원문 기준이라, analyze 단계에서 흘린 조건도 잡힌다.
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
process.env.SOURCE_STATS_LOG = "off";
const { generate } = await import("@/lib/llm");
const { Type } = await import("@google/genai");

const TRUTH: Record<string, string[]> = {
  국어: [
    "개요에 글의 목적·주제·예상 독자가 각각 구체적으로 설정되어 있다",
    "개요에 중심 내용과 세부 내용이 구분되어 구상되어 있다",
    "내용을 뒷받침하는 정보(근거)가 3가지 이상이고 각각 세어진다",
    "근거마다 출처가 명확히 밝혀져 있다",
    "스토리보드가 8개 장면이다(8개 기본, 10개까지 허용)",
    "장면들이 통일성·응집성을 갖추고 흐름으로 이어진다",
    "장면의 그림 자료가 그림·그래프·표만이다(사진·영상을 쓰지 않았다)",
    "장면 제목을 썼다면 명사형 키워드 1~2개를 넘지 않는다(안내문: 제목 부분에 명사형 키워드 1~2개까지 기록 '가능' — 제목 자체는 필수가 아니다)",
    "스토리보드에 완성된 발표 대본이 아니라 간단한 표시만 있다(안내문: 대본 없이 자연스럽게 발표)",
  ],
  과학: [
    "탐구보고서에 산·염기 물질의 특징이 서술되어 있다",
    "탐구보고서에 실험 과정이 서술되어 있다",
    "탐구보고서에 혼합 용액의 온도 변화가 서술되어 있다",
    "탐구보고서에 지시약의 색 변화가 서술되어 있다",
    "탐구보고서에 혼합 용액의 액성이 서술되어 있다",
    "탐구보고서에 중화반응의 이용 사례가 서술되어 있다",
    "실험 쪽에 리트머스 종이의 색변화가 다뤄져 있다",
    "실험 쪽에 BTB 용액의 색변화가 다뤄져 있다",
    "실험 쪽에 전기전도성이 다뤄져 있다",
    "실험 쪽에 금속과의 반응이 다뤄져 있다",
    "수업 운영 안내(차시·시험 대형·책상 간격·배점)를 글 안에 적지 않았다",
  ],
};
const SCHEMA: any = {
  type: Type.OBJECT,
  properties: { results: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { i: { type: Type.INTEGER }, ok: { type: Type.BOOLEAN }, why: { type: Type.STRING } }, required: ["i", "ok", "why"] } } },
  required: ["results"],
};
for (const [file, key] of process.argv.slice(2).map((a) => a.split("="))) {
  const md = fs.readFileSync(path.join(REPO, "scratchpad/measure/out", file), "utf8");
  const list = TRUTH[key];
  const res = await generate({
    label: "truth",
    role: "main",
    prompt:
      "학생이 제출할 글이 안내문 조건을 지켰는지 조건마다 판정해줘. 글에 그 내용이 실제로 있으면 ok=true, 없거나 조건을 어겼으면 false. why는 근거를 한 구절로.\n\n[조건]\n" +
      list.map((t, i) => `${i + 1}. ${t}`).join("\n") +
      `\n\n[글]\n${md}`,
    schema: SCHEMA,
  });
  const r = (JSON.parse(res.text ?? "{}").results ?? []) as { i: number; ok: boolean; why: string }[];
  const bad = r.filter((x) => !x.ok);
  console.log(`\n## ${file}  →  ${r.length - bad.length}/${list.length}`);
  for (const x of bad) console.log(`   ✗ ${list[x.i - 1]}\n       ${x.why.slice(0, 110)}`);
}
