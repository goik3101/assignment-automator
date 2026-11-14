// 암기·공부 도구(요약·플래시카드·퀴즈·가상 시험) 점검: 저장된 결과물(out/gc-<id>.md)을 자료로 도구 4종을 돌려 사람이 읽을 파일로 쓴다.
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/study-check.ts 과학-02 사회-03 ...
// 서버 경로(DB·로그인)를 거치지 않고 lib/study/tools를 직접 부른다 — 자료는 앱이 쓰는 것과 같은 `essayResultToText`(= 결과물 markdown)다.
import fs from "node:fs";
import path from "node:path";

const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));

const { makeSummary, makeFlashcards, makeQuiz, makeExam, gradeExam } = await import("@/lib/study/tools");
const { DEFAULT_STUDY_PREFS } = await import("@/lib/study/prefs");
const { clip } = await import("@/lib/study/context-pure");

const OUT = path.join(REPO, "scratchpad", "measure", "out");
const DEST = path.join(REPO, "scratchpad", "measure", "study");
fs.mkdirSync(DEST, { recursive: true });

const ids = process.argv.slice(2);
const results = JSON.parse(fs.readFileSync(process.env.GIANT_RESULTS ?? path.join(REPO, "scratchpad", "measure", "giant-results.json"), "utf8")) as Record<string, { name: string }>;

for (const id of ids) {
  const file = path.join(OUT, `gc-${id}.md`);
  if (!fs.existsSync(file)) {
    console.log(`${id}: 결과물 파일 없음`);
    continue;
  }
  // 앱의 결과물 markdown에는 우리가 harness에서 덧붙인 "## 출처" 목록이 없다 — 떼고 쓴다.
  const text = clip(fs.readFileSync(file, "utf8").replace(/\n## 출처[\s\S]*$/, "").trim());
  const ctx = { kind: "history" as const, id: "00000000-0000-0000-0000-000000000000", title: results[id]?.name ?? id, subject: id.split("-")[0], text, sourceLabel: "AI가 작성한 결과물" };
  const lines: string[] = [`# ${id} ${ctx.title} — 공부 도구 점검 (자료 ${text.length}자)`];
  const time: Record<string, number> = {};
  const run = async <T,>(name: string, fn: () => Promise<T>): Promise<T | null> => {
    const t0 = Date.now();
    try {
      const r = await fn();
      time[name] = (Date.now() - t0) / 1000;
      return r;
    } catch (e) {
      time[name] = (Date.now() - t0) / 1000;
      lines.push(`\n## ${name} — 실패: ${String(e).slice(0, 200)}`);
      return null;
    }
  };
  const [summary, cards, quiz, exam] = await Promise.all([
    run("요약", () => makeSummary(ctx, DEFAULT_STUDY_PREFS.summary)),
    run("플래시카드", () => makeFlashcards(ctx, DEFAULT_STUDY_PREFS.flashcards.count)),
    run("퀴즈", () => makeQuiz(ctx, DEFAULT_STUDY_PREFS.quiz)),
    run("가상 시험", () => makeExam(ctx)),
  ]);
  if (summary) {
    lines.push(`\n## 요약 (${time["요약"].toFixed(1)}초)\n**${summary.headline}**`);
    for (const p of summary.points) lines.push(`- ${p}`);
    for (const p of summary.paragraphs) lines.push(p);
    lines.push("\n핵심 용어:");
    for (const k of summary.keyTerms) lines.push(`- ${k.term}: ${k.meaning}`);
  }
  if (cards) {
    lines.push(`\n## 플래시카드 ${cards.length}장 (${time["플래시카드"].toFixed(1)}초)`);
    cards.forEach((c, i) => lines.push(`${i + 1}. 앞: ${c.front}\n   뒤: ${c.back}${c.hint ? `\n   힌트: ${c.hint}` : ""}`));
  }
  if (quiz) {
    lines.push(`\n## 퀴즈 ${quiz.length}문 (${time["퀴즈"].toFixed(1)}초)`);
    quiz.forEach((q, i) => {
      const ans = q.type === "match" ? (q.pairs ?? []).map((p) => `${p.left}=${p.right}`).join(" / ") : q.choices?.length ? `${q.answerIndex + 1}번 ${q.choices[q.answerIndex] ?? ""}` : (q.accepted?.length ? q.accepted.join(" | ") : q.answer ?? "");
      lines.push(`${i + 1}. [${q.type}] ${q.question}\n   ${q.choices?.length ? "보기: " + q.choices.map((c, k) => `${k + 1}) ${c}`).join(" / ") + "\n   " : ""}정답: ${ans}${q.explanation ? `\n   해설: ${q.explanation}` : ""}`);
    });
  }
  if (exam) {
    lines.push(`\n## 가상 시험 (${time["가상 시험"].toFixed(1)}초)\n제목: ${exam.title} / ${exam.durationMin}분\n문제: ${exam.task}\n조건: ${exam.requirements.join(" / ")}\n힌트: ${exam.hints.map((h, i) => `${i + 1}) ${h}`).join(" ")}\n채점 기준: ${exam.keyPoints.map((k) => `- ${k}`).join("\n")}`);
    // 채점 점검: 채점 기준 앞의 둘만 담은 부분 답안을 내 본다 — 만점이 나오면 채점이 후한 것이다.
    const partial = exam.keyPoints.slice(0, 2).join(" ");
    const g = await run("시험 채점", () => gradeExam(ctx, { task: exam.task, keyPoints: exam.keyPoints }, partial));
    if (g) lines.push(`\n부분 답안(기준 2개만 담음) 채점 → ${JSON.stringify(g).slice(0, 700)}`);
  }
  lines.push(`\n(시간: ${Object.entries(time).map(([k, v]) => `${k} ${v.toFixed(1)}초`).join(", ")})`);
  fs.writeFileSync(path.join(DEST, `${id}.md`), lines.join("\n"), "utf8");
  console.log(`${id} 완료 — ${Object.entries(time).map(([k, v]) => `${k} ${v.toFixed(1)}초`).join(", ")}`);
}
