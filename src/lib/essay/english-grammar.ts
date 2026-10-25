// 영어 글쓰기 과제의 필수 어법(수동태·It~that 강조·관계대명사) 사용 여부를 코드로 확인한다(모델 호출 없음).
// 실측(2026-10-22, 공통영어2 발명품 제안서): 필수 3가지 중 It~that 강조가 빠졌고, 앞선 실행은 가주어 구문("It is important that…")을 강조 구문으로 썼다 —
// 안내문은 "가주어-진주어 구문과 혼용하면 점수를 부여하지 않음"이라고 적었다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

export type GrammarForm = "passive" | "itThat" | "relative";

const REQUIRE: Record<GrammarForm, RegExp> = {
  passive: /수동태|passive/i,
  itThat: /It\s*~?\s*that|강조\s*(?:용법|구문)|cleft/i,
  relative: /관계\s*대명사|relative\s*pronoun/i,
};

/** 안내문·요구사항 글에서 요구된 어법. */
export function requiredGrammarForms(text: string): GrammarForm[] {
  return (Object.keys(REQUIRE) as GrammarForm[]).filter((f) => REQUIRE[f].test(text));
}

const PARTICIPLE = String.raw`(?:\w+ed|made|built|known|shown|given|taken|done|seen|found|sold|written|grown|worn|chosen|held|kept|left|lost|paid|put|set|sent|spent|told|thought|understood|brought|bought|caught|taught|driven|eaten|broken|spoken|stolen|frozen|hidden)`;
const PASSIVE = new RegExp(String.raw`\b(?:is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?${PARTICIPLE}\b`, "i");
// 강조 구문: It is/was + (명사구) + that/who … — 형용사 뒤의 that은 가주어-진주어 구문이라 인정하지 않는다.
const CLEFT = /\bIt\s+(?:is|was)\s+(?:not\s+)?(?:only\s+)?(?:the|a|an|this|these|those|its|their|our|my|his|her|because|in|on|at|by|with|through|when|[A-Z][\w-]*)\b[^.!?]{0,80}?\s(?:that|who)\b/;
const DUMMY_IT_ADJ = /\bIt\s+(?:is|was)\s+(?:very\s+|so\s+|really\s+)?(?:important|necessary|clear|true|possible|impossible|likely|unlikely|obvious|essential|natural|surprising|certain|interesting|amazing|good|bad|strange|fortunate|unfortunate|vital|crucial)\s+that\b/i;
const RELATIVE = /(?:\w|,)\s+(?:which|who|whom|whose)\s+\w+/i;
// 관계대명사 that: 명사 바로 뒤 that + 동사("approaches that can mitigate"). 실측(2026-10-24): which/who만 봐서 that을 쓴 글을 누락으로 판정해 보완 호출이 붙었다.
// "so that / such that / now that"과 동사 뒤 접속사 that("shows that the …")은 동사가 바로 이어지지 않아 걸리지 않는다. It~that 강조 구문은 따로 뺀다.
const RELATIVE_THAT = /\b(?!(?:so|such|now|is|was|are|were)\b)[a-z]{3,}\s+that\s+(?:is|are|was|were|can|could|will|would|may|might|must|should|has|have|had|does|do|did|makes|helps|allows|keeps|lets|uses|reduces|provides|[a-z]+(?:s|ed))\b/i;

function has(form: GrammarForm, text: string): boolean {
  const t = text.replace(/\*\*/g, "").replace(/\[\d+\]/g, "");
  if (form === "passive") return PASSIVE.test(t);
  if (form === "relative") return RELATIVE.test(t) || t.split(/(?<=[.!?])\s+/).some((x) => RELATIVE_THAT.test(x) && !CLEFT.test(x));
  // 가주어 구문만 있고 진짜 강조 구문이 없으면 없는 것
  const sentences = t.split(/(?<=[.!?])\s+/);
  return sentences.some((s) => CLEFT.test(s) && !DUMMY_IT_ADJ.test(s));
}

export function missingGrammarForms(content: string, forms: GrammarForm[]): GrammarForm[] {
  return forms.filter((f) => !has(f, content));
}

/** 부분 보완 지시 문구(잘못 쓰기 쉬운 점까지). */
export const GRAMMAR_REPAIR_TEXT: Record<GrammarForm, string> = {
  passive: "수동태(be + p.p.) 문장을 하나 이상 자연스럽게 넣고 그 수동태 부분을 **굵게** 표시",
  itThat:
    'It is/was ~ that 강조 구문을 한 문장 넣고 그 구문 전체를 **굵게** 표시(예: "It is the filter that removes bacteria."). "It is important that …" 같은 가주어-진주어 구문은 강조 구문이 아니니 쓰지 말 것',
  relative: "관계대명사(which/who/whom/whose/that) 절을 하나 이상 넣고 그 부분을 **굵게** 표시(where/when/why/how 같은 관계부사는 인정되지 않음)",
};
