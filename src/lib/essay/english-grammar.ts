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

function has(form: GrammarForm, text: string): boolean {
  // 밑줄 표시는 문장 중간을 끊는다("<u>It is the filter that</u> removes") — 태그를 떼고 봐야 어법이 잡힌다.
  const t = text.replace(/<\/?u>/gi, "").replace(/\*\*/g, "").replace(/\[\d+\]/g, "");
  if (form === "passive") return PASSIVE.test(t);
  if (form === "relative") return RELATIVE.test(t);
  // 가주어 구문만 있고 진짜 강조 구문이 없으면 없는 것
  const sentences = t.split(/(?<=[.!?])\s+/);
  return sentences.some((s) => CLEFT.test(s) && !DUMMY_IT_ADJ.test(s));
}

export function missingGrammarForms(content: string, forms: GrammarForm[]): GrammarForm[] {
  return forms.filter((f) => !has(f, content));
}

/** 부분 보완 지시 문구(잘못 쓰기 쉬운 점까지). */
export const GRAMMAR_REPAIR_TEXT: Record<GrammarForm, string> = {
  passive: "수동태(be + p.p.) 문장을 하나 이상 자연스럽게 넣고 그 수동태 부분을 <u>…</u>로 감싸 밑줄 표시(굵게로 대신하지 말 것)",
  itThat:
    'It is/was ~ that 강조 구문을 한 문장 넣고 그 구문 전체를 <u>…</u>로 감싸 밑줄 표시(예: "<u>It is the filter that</u> removes bacteria."). "It is important that …" 같은 가주어-진주어 구문은 강조 구문이 아니니 쓰지 말 것',
  relative: "관계대명사(which/who/whom/whose/that) 절을 하나 이상 넣고 그 부분을 <u>…</u>로 감싸 밑줄 표시(굵게로 대신하지 말 것. where/when/why/how 같은 관계부사는 인정되지 않음)",
};

/** 안내문이 그 표현에 밑줄까지 요구했는가. */
export function wantsUnderline(text: string): boolean {
  return /밑줄|underline/i.test(text);
}

/** <u> 태그를 떼면서, 밑줄 구간이 떼어낸 글에서 어디부터 어디까지였는지 함께 돌려준다. */
export function stripUnderlineTags(content: string): { text: string; ranges: [number, number][] } {
  const ranges: [number, number][] = [];
  let text = "";
  let open = -1;
  const re = /<\/?u>/gi;
  let last = 0;
  for (const m of content.matchAll(re)) {
    const at = m.index ?? 0;
    text += content.slice(last, at);
    last = at + m[0].length;
    if (m[0][1] === "/") {
      if (open >= 0) ranges.push([open, text.length]);
      open = -1;
    } else {
      open = text.length;
    }
  }
  text += content.slice(last);
  if (open >= 0) ranges.push([open, text.length]);
  return { text, ranges };
}

const FORM_RE: Record<GrammarForm, RegExp> = { passive: PASSIVE, itThat: CLEFT, relative: RELATIVE };

/**
 * 어법은 썼지만 **밑줄을 안 그은** 것들. 표현 전체가 아니라 일부만 겹쳐도 그은 것으로 본다 —
 * 학생이 관계사절만 밑줄 쳐도 채점자는 인정한다(실측 2026-11-01: 굵게만 나와 3개 항목이 0점이었다).
 */
export function missingUnderlinedForms(content: string, forms: GrammarForm[]): GrammarForm[] {
  const { text, ranges } = stripUnderlineTags(content);
  const clean = text.replace(/\[\d+\]/g, (m) => " ".repeat(m.length)).replace(/\*\*/g, "  ");
  return forms.filter((f) => {
    const re = new RegExp(FORM_RE[f].source, FORM_RE[f].flags.includes("i") ? "gi" : "g");
    let found = false;
    for (const m of clean.matchAll(re)) {
      const s = m.index ?? 0;
      const e = s + m[0].length;
      if (f === "itThat" && DUMMY_IT_ADJ.test(m[0])) continue;
      found = true;
      if (ranges.some(([a, b]) => s < b && a < e)) return false;
    }
    return found; // 아예 안 쓴 것은 missingGrammarForms가 따로 잡는다
  });
}

/** 밑줄만 빠졌을 때의 보완 지시(어법 자체는 이미 썼다). */
export const UNDERLINE_REPAIR_TEXT: Record<GrammarForm, string> = {
  passive: "이미 쓴 수동태(be + p.p.) 문장에서 그 수동태 부분만 <u>…</u>로 감쌀 것(굵게 **…** 는 밑줄이 아니다 — 채점자는 밑줄을 본다)",
  itThat: "이미 쓴 It is/was ~ that 강조 구문에서 그 구문 부분을 <u>…</u>로 감쌀 것(굵게 **…** 는 밑줄이 아니다)",
  relative: "이미 쓴 관계대명사 절 부분을 <u>…</u>로 감쌀 것(굵게 **…** 는 밑줄이 아니다)",
};

/**
 * 안내문이 밑줄을 요구했는데 모델이 안 그었으면 **코드가 직접 긋는다**.
 *
 * 실측(2026-11-02, 공통영어2): 누락 감지도 됐고 부분 보완도 돌았는데(1682→1803자) 결과물에 <u>가 0개였다.
 * 모델에게 "밑줄 쳐 달라"고 한 번 더 부탁하는 대신, 우리가 이미 가진 어법 정규식으로 그 자리를 찾아 감싼다.
 * 숫자 각주를 코드가 붙이는 것과 같은 방식이다 — 모델의 협조에 기대지 않는다.
 * 이미 밑줄이 쳐진 어법은 건드리지 않고, 못 찾은 어법은 그대로 둔다(없는 문장을 지어내지 않는다).
 */
export function underlineGrammarForms(content: string, forms: GrammarForm[]): { content: string; added: GrammarForm[] } {
  const added: GrammarForm[] = [];
  let out = content;
  for (const f of missingUnderlinedForms(content, forms)) {
    const re = new RegExp(FORM_RE[f].source, FORM_RE[f].flags.includes("i") ? "i" : "");
    // 태그 안에 또 태그가 생기지 않게, 이미 밑줄인 구간 밖에서만 찾는다.
    const { ranges } = stripUnderlineTags(out);
    const m = re.exec(out.replace(/<\/?u>/gi, (t) => " ".repeat(t.length)));
    if (!m) continue;
    const s = m.index;
    const e = s + m[0].length;
    if (ranges.some(([a, b]) => s < b && a < e)) continue;
    out = `${out.slice(0, s)}<u>${out.slice(s, e)}</u>${out.slice(e)}`;
    added.push(f);
  }
  return { content: out, added };
}
