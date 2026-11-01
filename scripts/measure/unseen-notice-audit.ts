// 우리가 한 번도 안 본 **꼴**의 안내문을 지어내서, 안내문을 읽는 규칙들이 꺼지는지 본다. 모델 호출 0.
//
// 왜: 우리 규칙은 안내문 9종으로 맞춰졌다. 다른 사용자가 전혀 다른 꼴을 들고 오면 규칙이 조용히 꺼지고,
// 꺼지면 결과물은 결함 검사를 그대로 통과한다(겉보기엔 멀쩡한데 안내문을 안 지킨 글).
// 생성까지 돌리면 비용이 크므로, **규칙만** 통과시켜 "무엇이 걸리고 무엇이 안 걸리는지" 먼저 본다.
//
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/unseen-notice-audit.ts
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));

const { needsSubjectSelection } = await import("@/lib/selection/selection-need");
const { visualPolicy, needsDataTable } = await import("@/lib/essay/data-visual");
const { extractCountRequirements, wantsBriefScenes } = await import("@/lib/essay/form-requirements");
const { needsExcerpt } = await import("@/lib/essay/excerpt-need");
const { findTimeRange } = await import("@/lib/essay/time-range");
const { cellSubfields } = await import("@/lib/essay/cell-subfields");
const { mentionsBookTask } = await import("@/lib/gemini/book-hint");
const { isListeningTest } = await import("@/lib/gemini/analysis-normalize");
const { studentPreparedVisuals } = await import("@/lib/essay/deliverable");
const { parseLengthConstraint } = await import("@/lib/gemini/length-parse");

interface Fake {
  id: string;
  /** 이 안내문이 **사람 눈으로** 요구하는 것(규칙이 잡아야 할 것). */
  expect: string[];
  requirements: string[];
  guide: string;
  element: { label: string; description: string; required_items?: string[] };
}

// 우리가 가진 9종에 **없는 꼴**만 고른다: 토론, 서평, 포스터 기획, 손편지, 진로 보고서, 수학 탐구.
const FAKES: Fake[] = [
  {
    id: "토론 입론문",
    expect: ["대상 선정", "개수 조건(근거 3가지)", "분량(800자 이내)"],
    requirements: ["토론 주제를 하나 골라 찬성 또는 반대 입장을 정한다.", "주장을 뒷받침하는 근거를 세 가지 이상 들고 출처를 밝힌다."],
    guide: "입론문은 800자 이내로 쓴다. 상대 주장에 대한 반박을 한 문단 포함한다.",
    element: { label: "입론문", description: "토론 주제에 대한 입론문을 작성한다.", required_items: ["주장", "근거", "반박"] },
  },
  {
    id: "서평",
    expect: ["책 과제", "원문 구절 인용"],
    requirements: ["읽은 책 한 권을 정해 서평을 쓴다.", "인상 깊은 구절을 원문 그대로 한 군데 옮겨 적고 그 이유를 쓴다."],
    guide: "서평에는 줄거리 요약이 글의 절반을 넘지 않게 한다.",
    element: { label: "서평", description: "읽은 책에 대한 서평을 쓴다.", required_items: ["책 정보", "인상 깊은 구절", "평가"] },
  },
  {
    id: "캠페인 포스터 기획",
    expect: ["학생이 준비할 시각 자료", "사진 금지", "칸마다 두 가지"],
    requirements: ["학교 안 문제 하나를 정해 캠페인 포스터를 기획한다.", "사진은 쓸 수 없고 직접 그린 그림만 가능하다."],
    guide: "기획안의 각 칸은 문구와 그림 설명으로 구성된다. 그림은 직접 준비한다.",
    element: { label: "포스터 기획안", description: "포스터 기획안을 칸에 맞춰 작성한다.", required_items: ["①", "②", "③"] },
  },
  {
    id: "손편지",
    expect: ["분량(15줄 이내)"],
    requirements: ["고마운 분께 손편지를 쓴다."],
    guide: "편지지 한 장, 15줄 이내로 쓴다. 받는 사람과 보내는 사람을 밝힌다.",
    element: { label: "편지", description: "고마운 분께 쓰는 손편지.", required_items: ["받는 사람", "본문", "보내는 사람"] },
  },
  {
    id: "진로 인물 탐구",
    expect: ["대상 선정", "표 요구"],
    requirements: ["관심 직업에서 인물 한 명을 선정하고 선정 이유를 쓴다.", "그 인물의 활동을 연표로 정리해 표로 제시한다."],
    guide: "조사한 내용은 출처를 밝힌다.",
    element: { label: "인물 탐구 보고서", description: "선정한 인물의 생애와 활동을 정리한다.", required_items: ["선정 이유", "생애", "활동", "배운 점"] },
  },
  {
    id: "수학 탐구",
    expect: ["표 요구", "개수 조건(문제 5개)"],
    requirements: ["일상에서 찾은 수학 문제 5개를 만들고 풀이 과정을 쓴다.", "결과를 표로 정리한다."],
    guide: "풀이는 식과 설명을 함께 쓴다.",
    element: { label: "탐구 보고서", description: "수학 문제와 풀이를 정리한다." },
  },
];

for (const f of FAKES) {
  const texts = [...f.requirements, f.guide, f.element.description];
  const all = texts.join(" ");
  const fired: string[] = [];
  if (needsSubjectSelection({ topic: f.id, requirements: f.requirements, task_elements: [f.element] })) fired.push("대상 선정");
  const counts = extractCountRequirements(texts);
  if (counts.length) fired.push(`개수 조건(${counts.map((c) => `${(c as { n?: number }).n ?? "?"}`).join(",")})`);
  if (needsDataTable(f.element as never, f.requirements, f.guide, true)) fired.push("표 요구");
  const pol = visualPolicy(texts);
  if ((pol.banned ?? []).length) fired.push(`자료 금지(${(pol.banned ?? []).join("·")})`);
  if (needsExcerpt(texts)) fired.push("원문 구절");
  if (findTimeRange(texts)) fired.push("다룰 기간");
  const subs = cellSubfields(texts);
  if (subs.length) fired.push(`칸 구성(${subs.join("+")})`);
  if (mentionsBookTask(all)) fired.push("책 과제");
  if (isListeningTest(f.element)) fired.push("듣기 평가");
  const vis = studentPreparedVisuals(texts);
  if (vis.length) fired.push(`학생 준비 시각자료(${vis.join("·")})`);
  if (wantsBriefScenes(texts)) fired.push("간단히 표시");
  const len = parseLengthConstraint(f.guide, { english: false, minutesAllowed: false });
  if (len) fired.push(`분량(${len.min}~${len.max}${len.unit ?? "자"})`);

  console.log(`\n### ${f.id}`);
  console.log(`   사람이 본 요구 : ${f.expect.join(" / ")}`);
  console.log(`   규칙이 잡은 것 : ${fired.join(" / ") || "(없음)"}`);
  const missed = f.expect.filter((e) => !fired.some((x) => x.startsWith(e.split("(")[0])));
  if (missed.length) console.log(`   ⚠ 놓친 것     : ${missed.join(" / ")}`);
}
