// 이 과제가 "책 속 인상 깊은 구절"처럼 원문 인용을 요구하는가. 요구하지 않으면 인용구 검색·원문 검증(100초 이상 걸리는 단계)을 돌리지 않는다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.
const EXCERPT_HINT = /구절|발췌|명대사|명문장|책\s*속\s*(?:한\s*)?문장|원문\s*(?:인용|구절|문장)|인상\s*깊(?:은|었던)\s*(?:문장|대목|장면\s*묘사)/;

export function needsExcerpt(texts: string[]): boolean {
  return EXCERPT_HINT.test(texts.join(" "));
}
