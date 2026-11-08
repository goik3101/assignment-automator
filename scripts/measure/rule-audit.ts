// 안내문을 읽어 "이 조건이 걸리는가"를 결정하는 관문 규칙들을, **문구 변형**을 넣어 전수로 검사한다.
// 모델 호출이 없으므로 비용 0 — 우리가 가진 안내문 5종 밖의 과제에서 무엇이 꺼지는지 미리 본다.
//
// 왜 필요한가: 지금까지는 사용자가 올린 결과물에서 터진 것만 고쳤다. 그러면 다른 선생님이 같은 조건을 다른 말로
// 적은 안내문에서 같은 규칙이 또 조용히 꺼진다(실측으로 이미 네 번 겪었다 — "뒷받침 정보"/"뒷받침하는 정보",
// "이슈리포트"/"보고서", "설정하고"/"정하고", "네 칸"/"4개 영역").
//
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/rule-audit.ts [규칙이름]
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));

const { needsSubjectSelection, selectionTargetWord, shouldAskSubject } = await import("@/lib/selection/selection-need");
const { visualPolicy, needsDataTable } = await import("@/lib/essay/data-visual");
const { isListeningTest } = await import("@/lib/gemini/analysis-normalize");
const { extractCountRequirements, hasSizeLimit, wantsBriefScenes, isSceneListElement } = await import("@/lib/essay/form-requirements");
const { isAttachmentStep, lengthRoleOf } = await import("@/lib/essay/length-plan");
const { planEvidence } = await import("@/lib/essay/evidence-slots");
const { needsExcerpt } = await import("@/lib/essay/excerpt-need");
const { findTimeRange } = await import("@/lib/essay/time-range");
const { compoundItemsFromText, splitCompoundItem } = await import("@/lib/essay/compound-items");
const { isInterrogativeItemList } = await import("@/lib/gemini/analysis-normalize");
const { requiredGrammarForms } = await import("@/lib/essay/english-grammar");
const { stepDependencies } = await import("@/lib/essay/step-order");
const { inferDeliverableForm, classifyRequiredItem } = await import("@/lib/essay/deliverable");

type Case = [want: boolean, text: string];
interface Rule {
  name: string;
  /** 무엇을 판정하는가(사람이 읽을 설명). */
  what: string;
  run: (text: string) => boolean;
  cases: Case[];
}

const el = (description: string) => ({ label: "산출물", description, required_items: [] as string[] });

const RULES: Rule[] = [
  {
    name: "선정필요",
    what: "학생이 대상을 골라야 하는 과제인가",
    run: (t) => needsSubjectSelection({ topic: "", requirements: [t], task_elements: [] } as never),
    cases: [
      [true, "탐구할 인물 한 명을 선정하여 조사한다."],
      [true, "관심 있는 사회 문제를 하나 골라 보고서를 쓴다."],
      [true, "다룰 사건을 정하고 그 배경을 설명하시오."],
      [true, "조사 대상 국가를 택하여 비교한다."],
      [true, "주제로 삼을 작품 한 편을 고른다."],
      [true, "모둠별로 탐구 주제를 선택한다."],
      [false, "발표 순서를 제비뽑기로 정한다."],
      [false, "글의 목적과 예상 독자를 구체적으로 설정하고 쓴다."],
      [false, "기초연금 선정기준액을 조사한다."],
      [false, "실험 기구를 선택해 사용한다."],
      // 생성 경로의 게이트는 의도적으로 좁다 — 여기가 켜지면 자동 선정 11~13초가 붙는다(30초 기준).
      [false, "주요 사건을 소재로 삼고 인터뷰를 작성한다."],
    ],
  },
  {
    name: "주제질문",
    what: "제작 전에 '무엇을 다룰지'를 물어야 하는 과제인가(질문 경로 전용, 더 넓음)",
    run: (t) => shouldAskSubject({ topic: "", requirements: [t], task_elements: [] } as never),
    cases: [
      // 고르라는 말이 없이 고르게 하는 문구 — 2026-11-02 신문 사고의 원문이 이것이었다.
      [true, "인터뷰는 1945~1948년 사이의 주요 사건을 소재로 삼고 작성한다."],
      [true, "관심 있는 인물을 대상으로 삼아 조사한다."],
      [true, "다룰 작품을 제재로 삼아 비평문을 쓴다."],
      [true, "탐구할 인물 한 명을 선정하여 조사한다."],
      [true, "관심 있는 사회 문제를 하나 골라 보고서를 쓴다."],
      [false, "안전을 최우선으로 삼고 실험에 임한다."],
      [false, "모둠 역할을 정하고 활동을 시작한다."],
      [false, "글의 목적과 예상 독자를 구체적으로 설정하고 쓴다."],
      [false, "발표 순서를 제비뽑기로 정한다."],
      [false, "실험 도구는 교사가 정해 준다."],
    ],
  },
  {
    name: "대상낱말_시",
    what: "'시(詩)'를 대상으로 읽는가 — 낱말 경계가 없으면 '시장'이 '시'가 된다",
    run: (t) => selectionTargetWord({ topic: "", requirements: [t], task_elements: [] } as never, true) === "시",
    cases: [
      [true, "마음에 드는 시 한 편을 골라 감상문을 쓴다."],
      [false, "시장 경제 체제에서 나타나는 경제 문제를 선정하고 분석한다."],
      [false, "시사 쟁점 하나를 골라 칼럼을 쓴다."],
      [false, "우리 지역의 문화재를 선정하여 소개한다."],
    ],
  },
  {
    name: "자료제한",
    what: "쓸 수 있는 시각 자료가 제한됐는가(허용 목록이 잡히는가)",
    run: (t) => (visualPolicy([t]).allowed ?? []).length > 0 || (visualPolicy([t]).banned ?? []).length > 0,
    cases: [
      [true, "그림 자료는 그림·그래프·표만 가능합니다."],
      [true, "사진은 사용할 수 없고 직접 그린 그림만 넣는다."],
      [true, "표와 그래프만 활용할 것."],
      [true, "인터넷에서 내려받은 이미지는 붙이지 마시오."],
      [false, "자료를 활용해 내용을 뒷받침한다."],
      [false, "그림을 그려 설명해도 좋다."],
    ],
  },
  {
    name: "표요구",
    what: "표·그래프를 만들어 넣으라고 했는가",
    run: (t) => needsDataTable(el(t), [t], undefined, true),
    cases: [
      [true, "조사한 내용을 표로 정리하시오."],
      [true, "통계를 그래프로 나타낼 것."],
      [true, "비교한 결과를 표에 정리해 넣는다."],
      [true, "연도별 변화를 도표로 제시한다."],
      // 2026-11-01 실측(통합사회2 인권 저널): "표는"의 조사 '는'이 BARE_TABLE에 없어 안 걸렸다 — 학생이 표 안내를 못 받았다.
      [true, "그림이나 표는 필수."],
      [true, "표은 반드시 들어가야 한다."],
      [true, "그래프나 표도 함께 넣을 것."],
      [false, "그림 자료는 그림·그래프·표만 가능합니다."],
      [false, "표지에 이름을 쓴다."],
      [false, "발표는 5분 이내로 한다."],
      [false, "대표는 한 명만 정한다."],
    ],
  },
  {
    name: "듣기평가",
    what: "듣고 파악하는 평가(글로 낼 산출물이 아님)를 걸러내는가",
    run: (t) => isListeningTest({ label: "화법의 원리 파악", description: t }),
    cases: [
      [true, "강연 또는 대화를 듣고 맥락을 고려하여 말하기의 내용 파악하기"],
      [true, "담화를 듣고 화자의 의도를 파악한다."],
      [true, "듣기 평가로 진행한다."],
      [false, "강연을 듣고 감상문을 작성한다."],
      [false, "대화를 듣고 요약문을 쓰시오."],
      [false, "친구의 발표를 듣고 평가지에 기록한다."],
      // 신문의 인터뷰 단계 — 규칙을 처음 넣었을 때 이것까지 지웠다(한 영역이 통째로 사라진다).
      [false, "당시를 겪은 사람의 이야기를 듣고 질문 2개와 답변 2개로 정리한다"],
      [false, "광복 당시를 겪은 인물과의 대화를 듣고 구성한다"],
      [false, "강연을 듣고 내용을 파악하여 기사로 구성한다"],
    ],
  },
  {
    name: "붙임칸",
    what: "자료를 붙이는 것이 본체인 단계인가(글은 제목·출처와 짧은 설명뿐)",
    run: (t) => isAttachmentStep({ label: t }),
    cases: [
      [true, "신문 기사 스크랩"],
      [true, "기사 오려 붙이기"],
      [true, "사진 부착"],
      // 글이 본체인 단계가 걸리면 분량이 200자로 깎인다 — 실측: 자료 수집 단계 만점 결과물이 1,095자다
      [false, "자료 수집"],
      [false, "탐구 보고서"],
      [false, "신문 기사 분석 및 소견"],
      [false, "경제 문제 분석 및 소견 평가지"],
      [false, "개요"],
    ],
  },
  {
    name: "지면칸",
    what: "한 지면을 나눠 맡은 칸인가(신문 영역 — 칸 하나 분량)",
    run: (t) =>
      lengthRoleOf(
        { label: t, description: `신문 양식의 ${t} 칸을 작성한다.` } as never,
        {
          topic: "광복부터 정부 수립 사이의 현대사를 주제로 신문 만들기",
          siblings: ["머리기사", "인터뷰", "사설/칼럼", "만평/광고"].map((l) => ({ label: l, description: `신문 양식의 ${l} 칸` })),
        } as never
      ) === "form_box",
    cases: [
      [true, "머리기사"],
      [true, "인터뷰"],
      [true, "사설/칼럼"],
      [true, "만평/광고"],
      // 그 신문의 영역이 아닌 이름은 걸리지 않는다(형제 목록에 없다)
      [false, "탐구 보고서"],
      [false, "개요"],
    ],
  },
  {
    name: "단계상한",
    what: "**단계 전체**의 분량 상한인가 — 칸마다 걸리는 조건은 아니어야 한다",
    run: (t) => hasSizeLimit(extractCountRequirements([t])),
    cases: [
      // 단계 전체에 걸리는 상한 — 걸려야 기본 분량 가이드를 빼고 안내문을 따른다
      [true, "발표 대본은 5문장 이내로 작성한다."],
      [true, "소감은 3문단 이내로 쓸 것."],
      [true, "10줄 내외로 작성하시오."],
      // 칸마다 걸리는 조건 — 걸리면 그 단계의 분량 목표가 통째로 사라진다(2026-11-08 실측, 871자·7/9)
      [false, "칸마다 1~2줄로 간단히 적는다."],
      [false, "각 칸에 2문장 이내로 쓴다."],
      [false, "장면별로 3줄 이내로 정리한다."],
      [false, "질문1·답변1·질문2·답변2는 각각 2줄 이내로 적는다."],
      [false, "한 칸에 두 문장 이내로 쓸 것."],
      // 장면 개수는 상한이 아니라 구조다(예전부터 제외)
      [false, "8개의 장면으로 스토리보드를 작성한다."],
      [false, "구체적으로 작성한다."],
    ],
  },
  {
    name: "개수조건",
    what: "장면·문장·문단 등 개수 조건을 읽는가",
    run: (t) => extractCountRequirements([t]).length > 0,
    cases: [
      [true, "8개의 장면으로 스토리보드를 작성한다."],
      [true, "다섯 문장 이내로 쓸 것."],
      [true, "3문단 이상으로 구성한다."],
      [true, "카드뉴스는 6컷으로 만든다."],
      [true, "10줄 내외로 작성하시오."],
      [true, "장면은 8개가 기본이며 10개까지 가능합니다."],
      // 번호를 붙여 반복하는 칸은 장면·컷만이 아니다 — 지어낸 안내문 20종에서 전부 놓쳤다(2026-11-04).
      [true, "일상에서 찾은 수학 문제 5개를 만들고 풀이 과정을 쓴다."],
      [true, "설문 문항 10개를 만들어 조사한다."],
      [true, "시는 4연 이상으로 구성한다."],
      [false, "구체적으로 작성한다."],
      [false, "2학기 수행평가입니다."],
      // 거짓 발동 검사 — "문제"는 아주 흔한 낱말이라 개수로 읽히면 안 되는 자리가 많다.
      [false, "시장 경제 체제에서 나타나는 경제 문제 1가지를 선정한다."],
      [false, "사회 문제를 하나 골라 보고서를 쓴다."],
      [false, "문제의 원인과 해결 방안을 서술한다."],
    ],
  },
  {
    name: "근거개수",
    what: "근거를 몇 개 모으라고 했는가",
    run: (t) =>
      planEvidence({ topic: "", requirements: [t], task_elements: [{ label: "글", description: "", required_items: ["뒷받침 정보", "출처"] }] } as never).slots >= 3,
    cases: [
      [true, "내용을 뒷받침하는 정보를 3가지 이상 수집하였는가?"],
      [true, "뒷받침 정보 3가지 이상"],
      [true, "근거 자료 3가지를 제시한다."],
      [true, "정보(근거) 3가지 이상"],
      [true, "서로 다른 근거를 세 가지 들 것."],
      [true, "논거 3개 이상을 활용한다."],
      [false, "근거를 들어 8개의 장면으로 구성한다."],
      [false, "개요와 스토리보드 2가지를 작성한다."],
    ],
  },
  {
    name: "간단히표시",
    what: "완성 대본을 쓰지 말라고 했는가",
    run: (t) => wantsBriefScenes([t]),
    cases: [
      [true, "스토리보드에는 간단히 표시"],
      [true, "대본 없이 자연스럽게 발표합니다."],
      [true, "장면에는 간단히 기록할 것"],
      [true, "콘티에는 핵심만 간단히 적는다."],
      [true, "원고를 보지 않고 발표한다."],
      [true, "대본을 읽지 말고 말할 것."],
      [false, "선정 이유를 간단히 설명한다."],
      [false, "장면마다 대사를 적는다."],
      [false, "대본을 바탕으로 영상을 제작한다."],
    ],
  },
  {
    name: "구절인용",
    what: "원문 구절을 그대로 옮기라고 했는가",
    run: (t) => needsExcerpt([t]),
    cases: [
      [true, "인상 깊은 구절을 그대로 옮겨 적고 느낌을 쓴다."],
      [true, "책에서 한 문장을 인용하여 소개할 것."],
      [true, "마음에 드는 문장을 골라 옮겨 쓰시오."],
      [false, "책의 줄거리를 요약한다."],
      [false, "출처를 밝혀 인용 자료를 활용한다."],
    ],
  },
  {
    name: "다룰기간",
    what: "다뤄야 할 시기를 못 박았는가",
    run: (t) => findTimeRange([t]) !== null,
    cases: [
      [true, "범위: 광복부터 대한민국 정부 수립 사이 시기(1945.8.15.~1948.8.15.)"],
      [true, "발행 시기는 1945년 8월부터 1948년 8월까지입니다."],
      [true, "1919년부터 1945년까지의 사건을 소재로 한다."],
      [true, "조선 후기(1600년~1800년) 시기를 다룬다."],
      [false, "제출 기한은 2026년 11월 2일부터 11월 6일까지다."],
      [false, "평가 일시: 2026.11.2.~2026.11.6."],
      [false, "인터넷 실명제에 대해 발표한다."],
    ],
  },
  {
    name: "나열항목",
    what: "한 항목이 여러 가지를 나열한 것인가",
    run: (t) => compoundItemsFromText([t]).length > 0,
    cases: [
      [true, "글의 목적, 주제, 예상 독자를 구체적으로 설정한다."],
      [true, "중심 내용과 세부 내용을 구상하였는가?"],
      [true, "원인, 양상, 영향, 해결 방안을 각각 작성할 것"],
      [true, "주제·선정 이유·느낀 점을 정리한다."],
      [false, "내용을 뒷받침하는 정보를 3가지 이상 수집한다."],
      [false, "산과 염기의 특징을 설명한다."],
      [false, "8개의 장면으로 스토리보드를 작성한다."],
    ],
  },
  {
    name: "5W1H안내",
    what: "항목이 칸 목록이 아니라 담을 내용 안내인가",
    run: (t) => isInterrogativeItemList(t.split("|")),
    cases: [
      [true, "누가|언제|어디서|무엇을|어떻게|왜"],
      [true, "누가|언제|어디서|사건의 영향"],
      [false, "인터뷰 대상|질문 1|답변 1|질문 2|답변 2"],
      [false, "글의 목적·주제·예상 독자|중심 내용과 세부 내용|출처"],
      [false, "무엇을 배웠는가|왜 중요한가"],
    ],
  },
  {
    name: "영어어법",
    what: "영어 과제가 특정 어법을 요구하는가",
    run: (t) => requiredGrammarForms(t).length > 0,
    cases: [
      [true, "수동태를 사용하여 작성할 것"],
      [true, "관계대명사를 포함한 문장을 쓰시오."],
      [true, "It ~ that 강조 구문을 반드시 넣는다."],
      [false, "120단어 이상으로 작성한다."],
      [false, "영어로 소개하는 글을 쓴다."],
    ],
  },
  {
    name: "단계의존",
    what: "앞 단계 결과를 받아 쓰는 단계인가",
    run: (t) => stepDependencies([{ label: "개요", description: "개요를 쓴다" }, { label: "스토리보드", description: t }]).length > 0,
    cases: [
      [true, "개요에서 생성한 내용을 바탕으로 스토리보드를 작성한다."],
      [true, "앞서 조사한 자료를 토대로 보고서를 쓴다."],
      [true, "개요를 참고하여 장면을 구성한다."],
      [false, "개요와 스토리보드를 모두 작성한다."],
      [false, "스토리보드를 8개 장면으로 쓴다."],
    ],
  },
  {
    name: "산출물형식",
    what: "신문·카드뉴스 같은 형식을 알아보는가",
    run: (t) => inferDeliverableForm({ label: t, description: t }) !== null,
    cases: [
      [true, "현대사 신문 만들기"],
      // inferDeliverableForm은 지금 신문만 알아본다(DeliverableForm = "newspaper"). 카드뉴스는 장면 규칙이 따로 맡는다.
      [false, "카드뉴스 제작"],
      [true, "역사 신문 머리기사"],
      [false, "탐구 보고서"],
      [false, "개요"],
    ],
  },
];

const only = process.argv.slice(2);
let totalMiss = 0;
let totalFalse = 0;
for (const rule of RULES) {
  if (only.length && !only.includes(rule.name)) continue;
  const miss: string[] = [];
  const falsePos: string[] = [];
  for (const [want, text] of rule.cases) {
    let got = false;
    try {
      got = rule.run(text);
    } catch (e) {
      got = false;
      falsePos.push(`(예외) ${text}`);
      continue;
    }
    if (want && !got) miss.push(text);
    if (!want && got) falsePos.push(text);
  }
  totalMiss += miss.length;
  totalFalse += falsePos.length;
  const ok = rule.cases.length - miss.length - falsePos.length;
  const mark = miss.length + falsePos.length === 0 ? "통과" : `**${miss.length}놓침 ${falsePos.length}오발동**`;
  console.log(`\n## ${rule.name} — ${rule.what}\n   ${ok}/${rule.cases.length} ${mark}`);
  for (const t of miss) console.log(`   ✗ 놓침   ${t}`);
  for (const t of falsePos) console.log(`   ✗ 오발동 ${t}`);
}
console.log(`\n=== 합계: 놓침 ${totalMiss}건 / 오발동 ${totalFalse}건 ===`);
