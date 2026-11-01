// 제작 전 질문(학생이 생성 전에 답하는 2~4개)을 전수로 본다 — 무엇을 묻고, 무엇을 안 묻는가.
//
// 왜 필요한가(실측 2026-11-02, 한국사 신문): 학생이 웹사이트에서 돌렸더니 질문이 "만평으로 할까요, 광고로 할까요?"
// 하나뿐이었다. 정작 **"어떤 역사 사건으로 신문을 만들까요?"**를 묻지 않아, 신문 전체가 '시사만화의 역사'가 됐다.
// 생성 경로만 재는 final-check.ts는 generateEssay()를 직접 부르므로 이 경로를 **한 번도 지나지 않았다**.
//
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/question-audit.ts [모드]
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
process.env.SOURCE_STATS_LOG = "off";

const { nextQuestion } = await import("@/lib/questions/next-question");
const { mergeInstructions } = await import("@/lib/questions/questions-pure");
const { analyzeAssignment } = await import("@/lib/gemini/analyze");
type CoreTaskInfo = import("@/types/task").CoreTaskInfo;
const IMG = path.join(REPO, "수행평가 안내문");

const mode = (process.argv[2] as "fast" | "personal") ?? "fast";
const only = process.argv[3] ?? "";
const repeat = Number(process.argv[4] ?? 1);

interface Case {
  id: string;
  file: string;
  images?: string[];
  instructions?: string;
}
const CASES: Case[] = [
  { id: "신문(역사)", file: "scratchpad/measure/newspaper-analysis.json", images: ["역사-1 - 복사본/KakaoTalk_20261021_232340155_02.jpg", "역사-1 - 복사본/KakaoTalk_20261021_232340155_01.jpg"] },
  { id: "국어(발표)", file: "scratchpad/measure/korean1-analysis.json" },
  { id: "사회 평가지", file: "scratchpad/measure/social-analysis.json" },
  { id: "카드뉴스(역사)", file: "scratchpad/measure/out/an-역사(카드뉴스)-1.json" },
  { id: "과학(산·염기)", file: "scratchpad/measure/out/an-과학(산염기)-1.json" },
];

for (const c of CASES) {
  if (only && c.id !== only) continue;
  for (let run = 0; run < repeat; run++) {
  const p = path.join(REPO, c.file);
  if (!fs.existsSync(p)) {
    console.log(`\n### ${c.id} — 분석 파일 없음(${c.file})`);
    continue;
  }
  // LIVE=1이면 실제 안내문 사진을 그때그때 분석해 그 결과로 질문을 만든다 — 학생이 웹사이트에서 겪는 경로 그대로다.
  // 저장된 분석만 쓰면 분석이 흔들릴 때 무슨 질문이 나가는지 영원히 못 본다(2026-11-02에 이것 때문에 놓쳤다).
  let raw: { core_task_info?: unknown; administrative_info?: { subject?: string }; subject?: string };
  if (process.env.LIVE === "1" && c.images?.length) {
    const imgs = c.images.map((f) => ({ base64: fs.readFileSync(path.join(IMG, f)).toString("base64"), mimeType: "image/jpeg" }));
    raw = (await analyzeAssignment({ imageBase64: imgs[0].base64, imageMimeType: imgs[0].mimeType, extraImages: imgs.slice(1), instructions: c.instructions })) as never;
  } else {
    raw = JSON.parse(fs.readFileSync(p, "utf8"));
  }
  const info = (raw.core_task_info ?? raw) as CoreTaskInfo;
  const subject = raw.subject ?? raw.administrative_info?.subject ?? "";
  console.log(`\n### ${c.id}  [${mode}]  주제: ${String(info.topic).slice(0, 70)}`);
  console.log(`   단계: ${(info.task_elements ?? []).map((e) => e.label).join(" / ")}`);
  const answers: { question: string; key?: string; answer: string; state: "answered" }[] = [];
  for (let i = 0; i < 4; i++) {
    const { question } = await nextQuestion({ subject, info, instructions: c.instructions ?? "", answers, mode });
    if (!question) {
      console.log(`   (${i + 1}번째: 더 묻지 않음)`);
      break;
    }
    console.log(`   Q${i + 1} [${question.kind}/${question.key}] ${question.text}`);
    console.log(`        보기: ${question.options.join(" | ") || "(없음)"}`);
    // 첫 보기를 고른 것으로 치고 다음 질문을 본다.
    answers.push({ question: question.text, key: question.key, answer: question.options[0] ?? "예", state: "answered" });
  }
  console.log(`   → 생성에 전달될 지침:\n${mergeInstructions("", answers as never).split("\n").map((l) => "        " + l).join("\n")}`);
  }
}
