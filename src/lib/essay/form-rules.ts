// 과제 유형별 작성 규칙. 공통 규칙(문체·사실·출처·메타 금지)은 prompts.ts가 맡고, 여기는 "이 종류의 글은 어떻게 짜는가"만 맡는다.
// 한 단계가 여러 유형의 성격을 가지면 조합한다(최대 2개). 안내문의 실제 요구사항이 항상 우선이라는 문구를 각 블록에 둔다.
// 신문은 deliverable.ts의 전용 지시문이 따로 있어 여기서 다루지 않는다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.
import { inferDeliverableForm } from "./deliverable.ts";
import { qualityFixesOn } from "./quality-flags.ts";

export type FormKind = "speech" | "report" | "experiment" | "debate" | "creative" | "selection_reason" | "reflection" | "argument" | "book_response" | "observation_record";

// 예전 "report" 규칙은 감상문·독후감·탐구 보고서에도 논설문 틀(문제 제기→근거→해석→결론, 사실·해석 구분)을 씌웠다.
// 실측(2026-10-20): 독서 감상문이 "…라는 주장에 설득됐다 / 근거로는 / 해석하자면 / 결론적으로"로, 논설문이 "사실(통계)은 …" 같은 이름표로 나왔다.
// 품질 개선(ESSAY_QUALITY_FIXES, 기본 켜짐)에서는 글 종류마다 따로 준다. 끄면 예전 RULES 그대로.
const QUALITY_RULES: Partial<Record<FormKind, { test: RegExp; labelTest?: RegExp; text: string }>> = {
  report: {
    test: /보고서|소논문|리포트/,
    text: "학생이 제출할 보고서다. 안내문이 정한 항목 순서를 따르되, 항목마다 핵심 사실(누가·언제·무엇을·왜)을 설명하고 그 의미나 영향을 이어지는 문단으로 쓸 것. 사실을 한 줄씩 나열하지 말고, 앞뒤 사실을 원인·결과·비교로 연결해 읽히는 글로 쓸 것. \"(해석)\", \"사실:\" 같은 이름표는 쓰지 말 것.",
  },
  argument: {
    test: /논설|논술|칼럼|비평|에세이/,
    text: "입장을 처음에 분명히 밝히고, 근거마다 구체적인 사실·통계·사례를 들어 주장과 연결할 것. 반론이 요구되면 예상 반론을 공정하게 쓰고 재반박할 것. \"근거 1\", \"해석·분석\", \"사실(통계)은\" 같은 구조 이름표를 문장에 쓰지 말고 문단 첫 문장이 그 역할을 드러내게 쓸 것.",
  },
  book_response: {
    test: /감상문|독후감|서평|독서\s*록|독서\s*일지/,
    text: "책을 읽은 학생의 글이다. 줄거리는 꼭 필요한 만큼만 자기 말로 짧게 소개하고, 가장 인상 깊은 장면·인물·생각을 중심으로 왜 그렇게 느꼈는지, 자신의 경험이나 생각과 어떻게 이어지는지를 쓸 것. 논설문처럼 \"주장 → 근거 → 해석 → 결론\" 틀이나 \"근거로는\", \"해석하자면\" 같은 표지를 쓰지 말 것. 출판사·번역자·출간 연도는 안내문이 요구하지 않으면 쓰지 말 것.",
  },
};

const RULES: Record<FormKind, { test: RegExp; labelTest?: RegExp; text: string }> = {
  speech: {
    test: /발표|대본|스피치|연설|speech|presentation/i,
    text: "말로 전하는 글이다. 짧은 문장, 도입(주제·목적) → 본론(핵심 2~3가지) → 마무리 구조, 청중에게 말하는 표현을 쓰되 읽는 글처럼 길고 무거운 문장은 피할 것. 슬라이드가 요구되면 장면별로 나눠 제시하고 슬라이드에 넣을 문구와 말할 내용을 구분할 것.",
  },
  report: {
    test: /보고서|논설|논술|에세이|소논문|비평|칼럼|독후감|감상문/,
    text: "문제 제기(또는 주장) → 근거 → 해석·분석 → 결론 순서로 쓰고, 단락마다 하나의 역할만 맡길 것. 주장마다 근거(사실·사례·자료)를 붙이고 사실과 해석을 구분할 것.",
  },
  experiment: {
    test: /실험|관찰|가설|변인|탐구\s*설계/,
    text: "학생이 아직 수행하지 않은 실험·관찰의 측정값·응답 수·평균은 지어내지 말 것. 예상 결과는 반드시 \"예상\"이라고 표시하고, 결론도 검증된 것처럼 단정하지 말 것. 가설-변인(독립·종속·통제)-방법-예상 결과의 논리가 이어지게 쓸 것.",
  },
  debate: {
    test: /토론|찬반|논박|입론|반론|쟁점/,
    text: "입장을 먼저 분명히 밝히고, 논거마다 \"주장 → 근거 → 사례\"를 갖출 것. 상대의 예상 반론 한두 가지를 짚고 재반박까지 쓸 것. 감정에 호소하기보다 확인 가능한 근거를 쓸 것.",
  },
  creative: {
    test: /창작|소설|수필|시\s*쓰기|이야기\s*(?:쓰기|만들기)|짧은\s*글짓기|글짓기|우화|시나리오/,
    text: "허구·창작이 중심인 글이다. 사실 검색에 기대지 말고 구체적인 장면·인물·감각 묘사로 쓰되 설명하듯 요약하지 말 것. 실존 인물·실제 사건을 다루면 그 부분만 사실로 취급할 것.",
  },
  selection_reason: {
    test: /선정\s*이유|선택\s*이유|동기|이유\s*작성/,
    labelTest: /선정\s*이유|선택\s*이유|동기|이유/,
    text: "대상을 고른 이유를 \"과제 조건에 맞는 점 → 그 점을 보여 주는 사실 한두 가지\"로 짧게 쓸 것. 학생이 실제로 말하지 않은 개인적 계기(어릴 때 읽었다 등)는 지어내지 말 것.",
  },
  reflection: {
    test: /소감|느낀\s*점|후기|성찰|반성|다짐/,
    labelTest: /소감|느낀\s*점|후기|성찰|반성|다짐/,
    text: "학생 본인의 경험과 생각을 쓰는 글이다. 학생이 밝히지 않은 경험·감정을 사실처럼 지어내지 말고, 조사·제작 과정에서 실제로 확인된 사실에서 출발한 초안으로 쓰되 \"(학생 감상 초안 — 본인 생각에 맞게 고쳐 쓰세요)\"로 표시할 것.",
  },
  // 실측(2026-10-24): 국어 "청중기록지"를 아직 하지 않은 발표를 본 것처럼("발표자는 눈빛과 손동작을 적절히 사용해…") 지어내고 감상 문장에 각주까지 달았다.
  observation_record: {
    test: /(?!)/,
    labelTest: /청중\s*기록|관찰\s*기록|기록\s*지|동료\s*평가|상호\s*평가|평가\s*지|모니터링|듣기\s*활동지/,
    text: "다른 사람의 발표·활동을 보면서 학생이 직접 채우는 기록지다. 아직 일어나지 않은 발표나 다른 학생의 말·태도·점수·평가를 지어내지 말 것. 안내문이 정한 칸(항목)마다 무엇을 어떻게 적으면 되는지 한두 문장의 작성 요령과 예시 질문을 쓰고, 실제 관찰 내용이 들어갈 자리는 \"[직접 작성: 무엇]\" 빈칸으로 남길 것. 출처 번호는 붙이지 말 것.",
  },
  // 아래 둘은 품질 개선이 켜졌을 때만 쓰인다(activeRules).
  argument: { test: /(?!)/, text: "" },
  book_response: { test: /(?!)/, text: "" },
};

function activeRules(): Record<FormKind, { test: RegExp; labelTest?: RegExp; text: string }> {
  return qualityFixesOn() ? { ...RULES, ...QUALITY_RULES } : RULES;
}

export function inferFormKinds(el: { label: string; description: string }): FormKind[] {
  if (inferDeliverableForm(el) === "newspaper") return [];
  const rules = activeRules();
  const found: FormKind[] = [];
  for (const kind of Object.keys(rules) as FormKind[]) {
    const r = rules[kind];
    // 소감·선정 이유는 단계 이름에서 직접 드러날 때만(설명 안의 "느낀 점" 언급은 다른 항목일 수 있다)
    const hit = r.labelTest ? r.labelTest.test(el.label) : r.test.test(`${el.label} ${el.description}`);
    if (hit) found.push(kind);
  }
  // 기록지는 그 규칙 하나만(설명에 "발표를 듣고"가 있어도 발표 대본 규칙을 섞지 않는다).
  if (found.includes("observation_record")) return ["observation_record"];
  // 창작이면 보고서·토론 같은 근거 중심 규칙과 섞지 않는다.
  let filtered = found.includes("creative") ? found.filter((k) => k === "creative" || k === "reflection" || k === "selection_reason") : found;
  // 감상문은 논설·보고서 틀과 섞지 않는다("비평문"처럼 둘 다 걸리는 단계는 감상 규칙 하나만).
  if (filtered.includes("book_response")) filtered = filtered.filter((k) => k !== "argument" && k !== "report");
  // 토론 규칙이 있으면 논설 규칙은 같은 말의 반복이다.
  if (filtered.includes("debate")) filtered = filtered.filter((k) => k !== "argument");
  return filtered.slice(0, 2);
}

/** 단계별 유형 규칙 블록. 해당하는 유형이 없으면 빈 문자열. */
export function buildFormRulesBlock(elements: { label: string; description: string }[]): string {
  const rules = activeRules();
  const lines: string[] = [];
  for (const el of elements) {
    for (const kind of inferFormKinds(el)) lines.push(`- "${el.label}" 단계: ${rules[kind].text}`);
  }
  if (lines.length === 0) return "";
  return `\n【글의 종류별 작성 방식 — 안내문의 요구가 이와 다르면 안내문을 따를 것】\n${lines.join("\n")}\n`;
}
