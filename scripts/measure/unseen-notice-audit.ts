// 우리가 한 번도 안 본 **꼴**의 안내문을 지어내서, 안내문을 읽는 규칙이 꺼지는지 본다. 모델 호출 0.
//
// 왜: 우리 규칙은 실제 안내문 9종으로 맞춰졌다. 다른 학생이 전혀 다른 꼴을 들고 오면 규칙이 조용히 꺼지고,
// 꺼지면 결과물은 결함 검사를 그대로 통과한다(겉보기엔 멀쩡한데 안내문을 안 지킨 글).
// 생성은 비용이 크므로 **규칙만** 통과시켜 "무엇이 걸리고 무엇이 안 걸리는지" 먼저 본다.
// 실측(2026-11-03, 6종): 구멍 3개가 바로 나왔고 그중 하나는 "안내문이 금지한 사진을 허용으로 읽음"이었다.
//
// 기대값은 **규칙 키**로 적는다(문구 비교는 거짓 경보를 만든다).
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

type Key = "선정" | "개수" | "표" | "금지" | "구절" | "기간" | "칸" | "책" | "듣기" | "시각자료" | "간단히" | "분량";

interface Fake {
  id: string;
  want: Key[];
  /** 걸리면 **안 되는** 규칙(거짓 발동 검사). */
  notWant?: Key[];
  requirements: string[];
  guide: string;
  element: { label: string; description: string; required_items?: string[] };
}

const FAKES: Fake[] = [
  {
    id: "토론 입론문",
    want: ["선정", "분량"],
    requirements: ["토론 주제를 하나 골라 찬성 또는 반대 입장을 정한다.", "주장을 뒷받침하는 근거를 세 가지 이상 들고 출처를 밝힌다."],
    guide: "입론문은 800자 이내로 쓴다.",
    element: { label: "입론문", description: "토론 입론문을 작성한다.", required_items: ["주장", "근거", "반박"] },
  },
  {
    id: "서평",
    want: ["책", "구절"],
    requirements: ["읽은 책 한 권을 정해 서평을 쓴다.", "인상 깊은 구절을 원문 그대로 한 군데 옮겨 적고 그 이유를 쓴다."],
    guide: "줄거리 요약이 글의 절반을 넘지 않게 한다.",
    element: { label: "서평", description: "읽은 책에 대한 서평.", required_items: ["책 정보", "인상 깊은 구절", "평가"] },
  },
  {
    id: "캠페인 포스터",
    want: ["금지", "칸", "시각자료"],
    requirements: ["학교 안 문제 하나를 정해 캠페인 포스터를 기획한다.", "사진은 쓸 수 없고 직접 그린 그림만 가능하다."],
    guide: "각 칸은 문구와 그림 설명으로 구성된다. 그림은 직접 준비한다.",
    element: { label: "포스터 기획안", description: "포스터 기획안을 칸에 맞춰 작성한다.", required_items: ["①", "②", "③"] },
  },
  {
    id: "손편지",
    // "15줄 이내"는 분량 파서가 아니라 **개수 조건**(line 단위)으로 읽는다 — 줄 수는 마크다운으로 셀 수 없어
    // 프롬프트로만 전한다(CLAUDE.md "개수 조건"). 2026-11-04에 기대값 쪽을 바로잡았다.
    want: ["개수"],
    notWant: ["표", "책"],
    requirements: ["고마운 분께 손편지를 쓴다."],
    guide: "편지지 한 장, 15줄 이내로 쓴다.",
    element: { label: "편지", description: "고마운 분께 쓰는 손편지.", required_items: ["받는 사람", "본문", "보내는 사람"] },
  },
  {
    id: "진로 인물 탐구",
    want: ["선정", "표"],
    requirements: ["관심 직업에서 인물 한 명을 선정하고 선정 이유를 쓴다.", "그 인물의 활동을 연표로 정리해 표로 제시한다."],
    guide: "조사한 내용은 출처를 밝힌다.",
    element: { label: "인물 탐구 보고서", description: "선정한 인물의 생애와 활동.", required_items: ["선정 이유", "생애", "활동", "배운 점"] },
  },
  {
    id: "수학 탐구",
    want: ["개수", "표"],
    requirements: ["일상에서 찾은 수학 문제 5개를 만들고 풀이 과정을 쓴다.", "결과를 표로 정리한다."],
    guide: "풀이는 식과 설명을 함께 쓴다.",
    element: { label: "탐구 보고서", description: "수학 문제와 풀이를 정리한다." },
  },
  {
    id: "실험 보고서",
    want: ["표"],
    notWant: ["선정", "책"],
    requirements: ["주어진 실험을 수행하고 결과를 기록한다."],
    guide: "측정값은 표로 정리하고 그래프로 나타낸다.",
    element: { label: "실험 보고서", description: "실험 과정과 결과를 기록한다.", required_items: ["실험 목적", "과정", "결과", "결론"] },
  },
  {
    id: "기행문",
    want: ["분량"],
    notWant: ["표", "선정"],
    requirements: ["다녀온 곳에 대한 기행문을 쓴다."],
    guide: "1000자 내외로 쓴다. 여정과 견문과 감상이 드러나게 한다.",
    element: { label: "기행문", description: "다녀온 곳에 대한 기행문.", required_items: ["여정", "견문", "감상"] },
  },
  {
    id: "자기소개서",
    want: [],
    notWant: ["표", "책", "선정"],
    requirements: ["지원 동기와 배운 점을 중심으로 자기소개서를 쓴다."],
    guide: "과장하지 말고 사실만 쓴다.",
    element: { label: "자기소개서", description: "지원 동기와 배운 점.", required_items: ["지원 동기", "노력한 점", "배운 점"] },
  },
  {
    id: "설문 보고서",
    want: ["표", "개수"],
    requirements: ["설문 문항 10개를 만들어 조사하고 결과를 분석한다."],
    guide: "결과는 표와 그래프로 제시한다.",
    element: { label: "설문 보고서", description: "설문 결과를 분석한다.", required_items: ["문항", "결과", "분석"] },
  },
  {
    id: "시 창작",
    want: ["개수"],
    notWant: ["표", "선정"],
    requirements: ["주제를 정해 시를 쓴다. 4연 이상으로 구성한다."],
    guide: "비유를 한 번 이상 쓴다.",
    element: { label: "시", description: "주제를 담은 시를 쓴다." },
  },
  {
    id: "영어 에세이",
    want: ["분량"],
    requirements: ["주제에 대한 영어 에세이를 쓴다."],
    guide: "150 words 이상 작성한다. 서론과 본론과 결론을 갖춘다.",
    element: { label: "Essay", description: "Write an essay on the topic.", required_items: ["Introduction", "Body", "Conclusion"] },
  },
  {
    id: "강연 듣기 평가",
    want: ["듣기"],
    requirements: ["강연을 듣고 내용을 파악한다."],
    guide: "수업 시간에 진행한다.",
    element: { label: "듣기 평가", description: "강연 또는 대화를 듣고 맥락을 고려하여 내용 파악하기" },
  },
  {
    id: "역사 인물 신문",
    want: ["선정", "기간", "시각자료"],
    requirements: ["1910~1945년 사이의 인물 한 명을 선정해 신문을 만든다.", "사진이나 그림은 미리 준비한다."],
    guide: "다루는 시기는 1910년부터 1945년까지다.",
    element: { label: "머리기사", description: "선정한 인물에 대한 기사.", required_items: ["제목", "내용"] },
  },
  {
    id: "발표 자료(대본 금지)",
    want: ["간단히"],
    requirements: ["주제를 정해 발표한다."],
    guide: "대본 없이 자연스럽게 말한다. 발표 자료에는 핵심 낱말만 간단히 표시한다.",
    element: { label: "발표 자료", description: "발표에 쓸 자료.", required_items: ["도입", "본론", "마무리"] },
  },
  {
    id: "독서 감상문(구절 없음)",
    want: ["책"],
    notWant: ["구절", "표"],
    requirements: ["읽은 책에 대한 감상문을 쓴다."],
    guide: "줄거리보다 느낀 점을 중심으로 쓴다.",
    element: { label: "감상문", description: "읽은 책에 대한 감상.", required_items: ["책 소개", "느낀 점"] },
  },
  {
    id: "모둠 계획서",
    want: [],
    notWant: ["선정", "표"],
    requirements: ["모둠별로 역할을 정하고 계획을 세운다."],
    guide: "역할과 일정을 정리한다.",
    element: { label: "계획서", description: "모둠 활동 계획.", required_items: ["역할", "일정", "준비물"] },
  },
  {
    id: "네 컷 만화",
    want: ["개수", "칸"],
    requirements: ["주제를 정해 네 컷 만화를 그린다."],
    guide: "각 컷은 그림과 대사로 구성한다.",
    element: { label: "네 컷 만화", description: "네 컷 만화를 구성한다." },
  },
  {
    id: "자료 검색 안내 있는 보고서",
    want: ["선정"],
    notWant: ["책"],
    requirements: ["관심 있는 사회 문제를 하나 골라 보고서를 쓴다.", "인터넷 검색(백과사전, 신문기사, 인물 평전, 책 내용 등)으로 자료를 수집할 것."],
    guide: "출처를 밝힌다.",
    element: { label: "보고서", description: "사회 문제 보고서.", required_items: ["문제", "원인", "해결"] },
  },
  {
    id: "영상 금지 포스터",
    want: ["금지"],
    requirements: ["포스터를 만든다. 영상은 사용할 수 없다."],
    guide: "그림과 글로만 구성한다.",
    element: { label: "포스터", description: "포스터를 구성한다." },
  },
];

let miss = 0;
let wrong = 0;
for (const f of FAKES) {
  const texts = [...f.requirements, f.guide, f.element.description];
  const all = texts.join(" ");
  const fired = new Set<Key>();
  if (needsSubjectSelection({ topic: f.id, requirements: f.requirements, task_elements: [f.element] })) fired.add("선정");
  if (extractCountRequirements(texts).length) fired.add("개수");
  if (needsDataTable(f.element as never, f.requirements, f.guide, true)) fired.add("표");
  if ((visualPolicy(texts).banned ?? []).length) fired.add("금지");
  if (needsExcerpt(texts)) fired.add("구절");
  if (findTimeRange(texts)) fired.add("기간");
  if (cellSubfields(texts).length) fired.add("칸");
  if (mentionsBookTask(all)) fired.add("책");
  if (isListeningTest(f.element)) fired.add("듣기");
  if (studentPreparedVisuals(texts).length) fired.add("시각자료");
  if (wantsBriefScenes(texts)) fired.add("간단히");
  if (parseLengthConstraint(f.guide, { english: /영어|English/i.test(f.id), minutesAllowed: false })) fired.add("분량");

  const missed = f.want.filter((k) => !fired.has(k));
  const bad = (f.notWant ?? []).filter((k) => fired.has(k));
  miss += missed.length;
  wrong += bad.length;
  console.log(`${missed.length || bad.length ? "⚠" : "  "} ${f.id.padEnd(26)} 걸림: ${[...fired].join(",") || "(없음)"}`);
  if (missed.length) console.log(`      놓침   : ${missed.join(", ")}`);
  if (bad.length) console.log(`      오발동 : ${bad.join(", ")}`);
}
console.log(`\n=== 지어낸 안내문 ${FAKES.length}종: 놓침 ${miss}건 / 오발동 ${wrong}건 ===`);
