// 직접 인용의 따옴표를 벗길 때 문장이 문법적으로 남도록 "인용문 + 뒤따르는 인용 조사"를 함께 재구성한다.
// 예) "…질문을 던졌다."라며 → …질문을 던졌다며   /   "…서로를 죽였다"[1].라고 → …죽였다고[1]
// 순수 함수(DB·LLM 호출 없음) — 사실·숫자·출처 번호는 그대로 두고 문장부호와 조사만 다룬다. 새 문장을 지어내지 않는다.

const QUOTATIVE = "(?:이라고|이라며|이라면서|이라는|라고|라며|라면서|라는)";
// "…다."고 밝혔다처럼 간접 인용 어미가 바로 붙는 경우 — 띄어 쓴 "고양이" 같은 일반 단어와 구분하려고 붙어 있을 때만 본다.
const BARE = "(?:면서|고|며|는)";
// 따옴표 바로 뒤: (각주들) (마침표/쉼표 하나) (인용 조사 | 바로 붙은 간접 인용 어미)
const TRAIL = new RegExp(`^((?:\\s*\\[\\d+\\])*)(?:\\s*[.,]?\\s*(${QUOTATIVE})|\\.?(${BARE})(?=[\\s,.]|$))`);
// 인용문 끝에 들어가 있던 각주: "…죽였다[1]." / "…죽였다.[1]"
const INNER_TRAILING_CITATIONS = /((?:\s*\[\d+\])+)([.!?…。]*)\s*$/;

const TERMINAL_PUNCT = /[.!?…。]+\s*$/;
// 서술형 종결(…다)이면 "다"에 인용 조사를 바로 붙이는 간접 인용이 자연스럽다: 던졌다 + 며 → 던졌다며
// (합쇼체 "~입니다/~습니다"는 간접 인용으로 바꾸면 "입니다고"가 되므로 서술형에서 뺀다.)
const DECLARATIVE_END = /[^니]다$/;
// 의문·감탄·해요체 등은 안전하게 간접 인용으로 바꿀 수 없다(추측해서 고치면 의미가 변할 수 있음).
const UNSAFE_END = /[?!？！]\s*$|[요까니죠지네군][.!?…]*\s*$/;
const HONORIFIC_END = /니(?:다|까)[.!?…]*\s*$/;

const INDIRECT: Record<string, string> = {
  라고: "고",
  이라고: "고",
  라며: "며",
  이라며: "며",
  라면서: "면서",
  이라면서: "면서",
  라는: "는",
  이라는: "는",
  고: "고",
  며: "며",
  면서: "면서",
  는: "는",
};

export interface UnquoteResult {
  /** 따옴표 자리에 들어갈 텍스트(뒤따르는 각주·조사 처리 포함). */
  text: string;
  /** 따옴표 뒤 원문에서 이 함수가 대신 처리한 글자 수(호출부는 그만큼 건너뛴다). */
  consumed: number;
  /** 안전하게 재구성할 수 없어 따옴표를 벗기지 않는 편이 낫다고 판단한 경우. */
  uncertain: boolean;
}

/**
 * 따옴표 안 텍스트와 그 뒤의 원문(after)을 받아, 따옴표를 벗긴 문법적인 텍스트를 만든다.
 * - 뒤에 인용 조사가 없으면: 따옴표만 벗기고 인용문 안의 문장부호는 그대로 둔다(문장 끝 마침표로 자연스럽다).
 * - 인용 조사가 있고 인용문이 서술형(…다)이면: 인용문 끝 문장부호를 지우고 "…다"에 조사를 붙인 간접 인용으로 바꾼다.
 * - 명사구 인용("…사기극")+"이라고"처럼 이미 문법적인 경우: 조사를 그대로 둔다.
 * - 의문·감탄·해요체 인용+조사: 안전하게 못 바꾸므로 uncertain=true(호출부는 따옴표를 유지).
 */
export function rewriteUnquoted(quoteText: string, after: string): UnquoteResult {
  const original = quoteText.trim();
  const m = TRAIL.exec(after);
  if (!m) return { text: original, consumed: 0, uncertain: false };

  // 인용문 안 끝에 있던 각주는 떼어 조사 뒤로 옮긴다(번호는 그대로).
  const inner = INNER_TRAILING_CITATIONS.exec(original);
  const t = inner ? original.slice(0, inner.index) + inner[2] : original;
  const citations = ((inner?.[1] ?? "") + (m[1] ?? "")).replace(/\s+/g, "");
  const particle = m[2] ?? m[3];
  const isBare = m[2] === undefined;
  const consumed = m[0].length;
  const body = t.replace(TERMINAL_PUNCT, "");

  if (HONORIFIC_END.test(t) || (UNSAFE_END.test(t) && !DECLARATIVE_END.test(body))) return { text: original, consumed: 0, uncertain: true };
  if (DECLARATIVE_END.test(body)) {
    return { text: `${body}${INDIRECT[particle]}${citations}`, consumed, uncertain: false };
  }
  // 명사구 뒤에 바로 붙은 고/며/는은 원래 문장 자체가 어색해 추측해서 고치지 않는다.
  if (isBare) return { text: original, consumed: 0, uncertain: true };
  // 명사구 등: 원래 조사를 그대로 붙인다(문장부호만 정리).
  return { text: `${body}${particle}${citations}`, consumed, uncertain: false };
}

/**
 * content 안의 따옴표 인용 중 shouldStrip이 true인 것만 따옴표를 벗기고 뒤따르는 문장부호·인용 조사를 함께 정리한다.
 * 어느 인용을 벗길지는 호출부가 정한다(generate-essay.ts의 stripWeaklySourcedQuotes). 안전하게 못 바꾸면 따옴표를 유지하고 onKeep을 부른다.
 */
export function stripQuotesWhere(
  content: string,
  pattern: RegExp,
  shouldStrip: (quoteText: string, afterEnd: number) => boolean,
  onKeep?: (quoteText: string) => void,
  onStrip?: (quoteText: string) => void
): { content: string; strippedCount: number } {
  let out = "";
  let cursor = 0;
  let strippedCount = 0;
  for (const m of content.matchAll(pattern)) {
    const offset = m.index ?? 0;
    if (offset < cursor) continue; // 앞선 재구성이 이미 소비한 구간
    const quoteText = m.slice(1).find((g) => g !== undefined) ?? "";
    const afterEnd = offset + m[0].length;
    if (!shouldStrip(quoteText, afterEnd)) continue;

    const rw = rewriteUnquoted(quoteText, content.slice(afterEnd));
    const candidate = rw.text + content.slice(afterEnd + rw.consumed, afterEnd + rw.consumed + 40);
    if (rw.uncertain || findQuoteResidue(candidate).length > 0) {
      onKeep?.(quoteText);
      continue;
    }
    strippedCount++;
    onStrip?.(quoteText);
    out += content.slice(cursor, offset) + rw.text;
    cursor = afterEnd + rw.consumed;
  }
  out += content.slice(cursor);
  return { content: out, strippedCount };
}

/** 인용 제거 후 남은 어색한 잔여물(문장부호 + 인용 조사, 종결 뒤 조사 등)이 있는가. 테스트·회귀 스캔용. */
export function findQuoteResidue(text: string): string[] {
  const out: string[] = [];
  const re = /[.!?…]\s*(?:\[\d+\]\s*)*(?:이라고|이라며|이라면서|이라는|라고|라며|라면서|라는)(?=[\s,.]|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(text.slice(Math.max(0, m.index - 15), m.index + m[0].length + 5));
  return out;
}
