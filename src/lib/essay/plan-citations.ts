// 조사→글쓰기 경로에서 "무엇을 쓰겠다"는 계획·작업 서술 문장에 붙은 각주를 걷어낸다.
// 실측(2026-10-29, 저장된 생성 20회): 각주가 붙은 문장 340개 중 38개(11.2%, 20회 중 12회)가 사실이 아니라
// "먼저 헌법재판소의 위헌 결정을 근거로 법적 문제를 설명한다[1]"처럼 개요의 계획 문장이었다. 그 페이지에 "설명한다"는 계획이 있을 리 없다.
// 개요는 본래 계획 글인데 사실 노트 규칙은 "사실을 쓴 문장에 번호를 붙여라"만 말하고, 기존 후처리 셋은 전부 이 문장을 비켜간다:
// stripUnjustifiedNarrativeCitations는 이 경로에서 꺼져 있고, stripOpinionCitations는 1인칭·생각 종결만 보며, checkClaims는 숫자 없는 문장을 통과시킨다.
// 오탐이 더 해로우므로 범위를 좁힌다 — 같은 20회에서 느슨한 규칙(계획 동사만)은 사실 서술까지 34건을 잡았고, 아래 규칙은 20건을 잡으며 오탐 0건이었다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

/** 글의 짜임을 가리키는 말 — 이 말이 있으면 "내용"이 아니라 "쓸 순서"를 말하는 문장이다. */
// "첫째·둘째"는 보통 deliverable.ts의 서수 정리가 "먼저·다음으로"로 바꾼 뒤에 이 함수가 보지만, ORDINAL_STYLE=strip이거나 표기가 달라 남는 경우도 있어 함께 둔다.
const STRUCTURE =
  /(?:^|[\s(\-•·])(?:먼저|우선|다음으로|이어서|마지막으로|끝으로|서론|본론|결론|도입부|첫째|둘째|셋째|넷째|이\s*글(?:은|에서는)|이\s*발표(?:는|에서는)|발표에서는|개요에서는|본\s*발표)/;
/** 글쓴이의 의지("~할 것이다", "~하겠다") — 사실 서술에는 거의 쓰이지 않는다. */
const INTENT = /(?:할\s*것이다|쓸\s*것이다|하겠다|보여\s*주겠다)[.!?]?\s*$/;
/** 계획 동사로 끝나는 문장. 문장 끝만 본다("정리한다고 밝혔다" 같은 사실 서술을 잡지 않기 위해서다). */
const PLAN_VERB =
  /(?:제시한다|제시할\s*것이다|제시하겠다|설명한다|설명할\s*것이다|다룬다|다룰\s*것이다|비교한다|비교할\s*것이다|제안한다|강조한다|활용한다|활용할\s*것이다|보여\s*준다|보여준다|배치한다|인용한다|구성한다|정리한다|전개한다|마무리한다|쓸\s*것이다|삼을\s*것이다|사용할\s*것이다)[.!?]?\s*$/;
/** 연도·수치·책 제목·직접 인용이 있으면 사실 문장일 수 있으므로 건드리지 않는다(opinion-citations.ts와 같은 기준). */
const FACTUAL_SIGNAL = /\d|『|《|「|"|“|‘/;
/**
 * 주어가 출처 쪽인 문장("도입 경험과 연구는 … 부작용을 낳았음을 보여 준다")은 계획이 아니라 사실 서술이다 —
 * 20회 전수 확인에서 유일하게 나온 오탐이라 주어를 보고 뺀다. "연구 결과로 보여 준다"처럼 수단으로 쓴 말은 그대로 둔다.
 */
const EVIDENCE_SUBJECT = /(?:연구|자료|보고서|통계|기사|조사|판결|결정문|사례|경험|논문|분석)(?:는|은|이|가|들은|들이)\s/;

export function isPlanSentence(text: string): boolean {
  const s = text.replace(/\[\d+\]/g, "").trim();
  if (!s || FACTUAL_SIGNAL.test(s) || EVIDENCE_SUBJECT.test(s)) return false;
  return PLAN_VERB.test(s) && (STRUCTURE.test(s) || INTENT.test(s));
}

/** 계획·작업 서술 문장의 각주 표시만 뗀다(문장 자체는 그대로 둔다). */
export function stripPlanCitations(content: string): { content: string; stripped: number } {
  let stripped = 0;
  const out = content
    .split("\n")
    .map((line) => {
      if (/^\s*(?:#|\|)/.test(line)) return line;
      return line.replace(/([^.!?。\n]*?[^.!?。\n[\]\d])((?:\[\d+\])+)(?=[.!?。]|\s|$)/g, (m, sentence: string, markers: string) => {
        // 앞 절에 붙은 각주 번호의 숫자는 사실 신호가 아니다 — 번호를 지운 뒤에 판단한다.
        const s = sentence.replace(/^[\s.!?]+/, "");
        if (!isPlanSentence(s)) return m;
        stripped += markers.match(/\[\d+\]/g)!.length;
        return sentence;
      });
    })
    .join("\n");
  return { content: stripped ? out : content, stripped };
}
