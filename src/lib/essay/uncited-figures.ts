// 각주 없이 남은 수치 문장을 찾는다. 실측(2026-10-30, 결함 전수 검사): 오늘 코드로 만든 글에서 마지막까지 남은 1위 결함이었다.
// 두 가지를 구분해야 한다 — 노트에 있는 값인데 번호만 빠진 것(코드가 붙이면 된다)과, 노트에 아예 없는 값(모델이 아는 지식으로 쓴 것).
// 뒤쪽은 출처를 붙일 수 없으므로 그 수치를 노트의 값으로 바꾸거나 수치 없는 서술로 고치게 한다 — 지어낸 숫자를 그대로 두지 않는다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

/** 글에서 "출처가 필요한 값"으로 보는 표기. 날짜·분량·쪽수처럼 글 자체를 설명하는 숫자는 뺀다. */
const FIGURE =
  /(?<![\d.,])(1[0-9]{3}|20[0-9]{2})\s*년|(?<![\d.])\d+(?:\.\d+)?\s*(?:%|퍼센트|㎍|㎎|[μu]g|mg|톤|명|건|배|억|조|만\s*명|개국)|(?<![\d.])\d{1,3}(?:,\d{3})+/;
/** 학생의 의견·계획·목표 문장은 사실 주장이 아니다(claim-check.ts와 같은 기준). */
const OPINION_OR_PLAN =
  /(?:^|[\s"“(])(?:나는|내가|저는|제가)|(?:생각한다|생각했다|느꼈다|느낀다|바란다|다짐한다|제안한다|권한다|예정이다|계획이다|하려\s*한다|할\s*것이다|해야\s*한다|필요하다|하겠다)[.!?]?\s*$/;

export interface UncitedFigure {
  text: string;
  /** 그 문장에 들어 있는 값들 */
  values: string[];
  /** 조사 노트에 같은 값이 있는가(있으면 번호만 빠진 것) */
  inNotes: boolean;
}

const norm = (v: string) => v.replace(/[\s,]/g, "");

export function valuesIn(text: string): string[] {
  const out = new Set<string>();
  const re = new RegExp(FIGURE.source, "g");
  for (const m of text.matchAll(re)) out.add(norm(m[0]));
  return [...out];
}

function splitSentences(content: string): string[] {
  return content
    .split("\n")
    .filter((l) => !/^\s*(?:#|\|)/.test(l))
    // 각주가 마침표 뒤에 붙으면("판결했다.[1] 다음") 공백만으로는 안 나뉜다.
    .flatMap((l) => l.split(/(?<=[.!?。](?:\[\d+\])*)\s+/))
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

/** 각주가 없는 수치 문장을 모은다. factTexts는 조사 노트의 사실 문장. */
export function findUncitedFigures(content: string, factTexts: string[] = []): UncitedFigure[] {
  const noteValues = new Set(factTexts.flatMap((f) => valuesIn(f)));
  const out: UncitedFigure[] = [];
  for (const s of splitSentences(content)) {
    if (s.length < 10 || /\[\d+\]/.test(s) || /https?:\/\//.test(s)) continue;
    if (OPINION_OR_PLAN.test(s)) continue;
    const values = valuesIn(s);
    if (values.length === 0) continue;
    out.push({ text: s, values, inNotes: values.some((v) => noteValues.has(v)) });
  }
  return out;
}

/** 노트에 없는 값을 쓴 문장을 고치게 하는 지시(그 단계만 다시 쓰는 경로로 전달한다). */
export function uncitedFigureRepairText(items: UncitedFigure[]): string {
  const quoted = items.slice(0, 3).map((i) => `"${i.text.slice(0, 55)}…"`).join(" / ");
  return (
    `다음 문장에 조사 자료에 없는 수치가 출처 없이 들어 있다(${quoted}). ` +
    `조사 자료에 있는 값으로 바꾸고 그 번호를 붙이거나, 숫자를 빼고 "크게 늘었다", "주요 원인 가운데 하나다"처럼 ` +
    `자료로 확인할 수 있는 만큼만 서술할 것. 확인되지 않은 숫자를 그대로 남기지 말 것. 다른 문장과 각주는 그대로 둘 것.`
  );
}
