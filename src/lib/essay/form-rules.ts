// 과제 유형별 작성 규칙. 공통 규칙(문체·사실·출처·메타 금지)은 prompts.ts가 맡고, 여기는 "이 종류의 글은 어떻게 짜는가"만 맡는다.
// 한 단계가 여러 유형의 성격을 가지면 조합한다(최대 2개). 안내문의 실제 요구사항이 항상 우선이라는 문구를 각 블록에 둔다.
// 신문은 deliverable.ts의 전용 지시문이 따로 있어 여기서 다루지 않는다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.
import { inferDeliverableForm } from "./deliverable.ts";

export type FormKind = "speech" | "report" | "experiment" | "debate" | "creative" | "selection_reason" | "reflection";

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
};

export function inferFormKinds(el: { label: string; description: string }): FormKind[] {
  if (inferDeliverableForm(el) === "newspaper") return [];
  const found: FormKind[] = [];
  for (const kind of Object.keys(RULES) as FormKind[]) {
    const r = RULES[kind];
    // 소감·선정 이유는 단계 이름에서 직접 드러날 때만(설명 안의 "느낀 점" 언급은 다른 항목일 수 있다)
    const hit = r.labelTest ? r.labelTest.test(el.label) : r.test.test(`${el.label} ${el.description}`);
    if (hit) found.push(kind);
  }
  // 창작이면 보고서·토론 같은 근거 중심 규칙과 섞지 않는다.
  const filtered = found.includes("creative") ? found.filter((k) => k === "creative" || k === "reflection" || k === "selection_reason") : found;
  return filtered.slice(0, 2);
}

/** 단계별 유형 규칙 블록. 해당하는 유형이 없으면 빈 문자열. */
export function buildFormRulesBlock(elements: { label: string; description: string }[]): string {
  const lines: string[] = [];
  for (const el of elements) {
    for (const kind of inferFormKinds(el)) lines.push(`- "${el.label}" 단계: ${RULES[kind].text}`);
  }
  if (lines.length === 0) return "";
  return `\n【글의 종류별 작성 방식 — 안내문의 요구가 이와 다르면 안내문을 따를 것】\n${lines.join("\n")}\n`;
}
