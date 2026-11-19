// 책 후보 제안(selectBookCandidateFast)이 어떤 책을 내는지 눈으로 본다 — 검색 없는 호출이라 건당 약 $0.003.
// 왜: 차별화 안내("최근 다른 학생들이 자주 고른 책과 겹치지 않는 대안을 우선")가 인지도 낮은 책으로 밀어낼 수 있다는 지적(2026-11-19).
// "최근 자주 고른 책" 안내가 붙은 실제 상황을 흉내 내고, 같은 입력을 여러 번 돌려 후보 목록을 그대로 찍는다. 인지도는 사람이 읽고 판단한다.
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/book-candidates-check.ts [횟수=4] [주제 파일=scratchpad/measure/bookrx.analysis.json]
import fs from "node:fs";
import path from "node:path";

process.loadEnvFile(path.join(process.cwd(), ".env.local"));
process.env.SOURCE_STATS_LOG = "off";
const { selectBookCandidateFast } = await import("@/lib/gemini/generate-essay");
const { withLlmTrace } = await import("@/lib/llm");

const runs = Number(process.argv[2] ?? 4);
const file = process.argv[3] ?? path.join(process.cwd(), "scratchpad", "measure", "bookrx.analysis.json");
const core = JSON.parse(fs.readFileSync(file, "utf8"));
// recommendation-diversity.ts가 실제로 붙이는 안내문과 같은 모양(그 파일의 문구를 바꾸면 여기도 같이 본다).
const { guidanceInstructionText } = await import("@/lib/recommendations/recommendation-diversity");
const guidance = guidanceInstructionText("책", ["데미안(최근 5회)", "아몬드(최근 4회)", "미움받을 용기(최근 3회)", "어린 왕자(최근 2회)", "82년생 김지영(최근 2회)"]);

const lines: string[] = [];
const orig = console.log.bind(console);
console.log = (...a: unknown[]) => {
  const l = a.map(String).join(" ");
  if (l.includes("책 후보(검색 없이 제안)")) lines.push(l.replace("[generateEssay] 책 후보(검색 없이 제안): ", ""));
  else if (!l.startsWith("[")) orig(...a);
};
await withLlmTrace("book-cand", async () => {
  for (let i = 0; i < runs; i++) {
    await selectBookCandidateFast({ subject: "", coreTaskInfo: core, instructions: "친구의 고민은 '소심한 성격이라 새 친구를 잘 사귀지 못한다'는 거야.", selection: { history: [] }, recentBookGuidance: guidance });
  }
});
console.log = orig;
lines.forEach((l, i) => console.log(`#${i + 1} ${l}`));
