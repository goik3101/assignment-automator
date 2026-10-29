// "검증이 필요한 사실 주장이 있는가" 판정(순수 함수 — 출처 검증 경고 배너를 띄울지 가르는 기준). 원래 generate-essay.ts 안에 있던 규칙을 그대로 옮겼고,
// 장면 목록 단계(스토리보드·카드뉴스)와 실행 계획 경로에서도 쓰도록 분리했다. alias import 없음 — node:test에서 바로 불러올 수 있게.
//
// 통계·연구·사례·연도·수량 같은 실제 사실 주장 표현. 각 낱말이 추가된 사연(실측 사례)은 generate-essay.ts의 FACTUAL_CLAIM_HINT_PATTERN 옆 이력 주석에 남아 있다.
export const FACTUAL_CLAIM_HINT_PATTERN =
  /통계|수치|%|퍼센트|사례|자료|조사|보고서|논문|기사|뉴스|데이터|현황|정의|용어|전문|연구|평균|비율|\d{3,4}\s*년|\d+\s*세기|\d+\s*(시간|명|건|개|배|주|일)|최초|유일한?|결정적|창시|발명|창립|만들었다|제정했다|발표했다|창간했다|설립했다|수호했다|영향을\s*미쳤다|영향을\s*주었다|원인이\s*되었다|(?:로|으로)\s*이어졌다|기틀이\s*되었다|가능하게\s*했다/;

// 따옴표로 묶은 인용구(8~150자). 흔히 쓰이는 따옴표 종류(직선/둥근/한글식)를 모두 잡는다. g 플래그라 쓰기 전에 lastIndex를 0으로 돌릴 것.
export const QUOTE_PATTERN = /"([^"]{8,150})"|“([^”]{8,150})”|「([^」]{8,150})」|『([^』]{8,150})』/g;

export const BOOK_TITLE_PATTERN = /《[^》]{2,60}》|『[^』]{2,60}』/;

// 장면 목록 단계의 "구체적 사실" 신호 — 연도·퍼센트·큰 수·인원/건수. 대사의 따옴표와 "통계·조사" 같은 일반 낱말, 시간 표기("0~6초", "2분30초")는 세지 않는다.
const STRONG_FACT_PATTERN = /\d{3,4}\s*년|\d+(?:\.\d+)?\s*(?:%|퍼센트)|\d{1,3}(?:,\d{3})+|\d+\s*(?:명|건|배|개국|억|조)/;

/**
 * 글에 외부 검증이 필요한 사실 주장이 있는가. 책 제목·직접 인용·사실 주장 낱말 중 하나라도 있으면 true(기존 규칙 그대로).
 * sceneList(스토리보드 같은 장면 단계)는 대사·화면 설명이 따옴표와 일반 낱말을 자연스럽게 쓰는 글이라 소제목을 뺀 본문에서
 * 책 제목이나 구체적 수치·연도가 있을 때만 true다 — 그렇지 않으면 사실 주장이 없는 장면 묘사에 "검증되지 않았어요" 배너가 뜬다(실측 2026-10-28).
 */
export function hasVerifiableClaimText(content: string, opts: { sceneList?: boolean } = {}): boolean {
  if (opts.sceneList) {
    const body = content
      .split("\n")
      .filter((l) => !/^\s*#{1,6}\s/.test(l))
      .join("\n");
    return BOOK_TITLE_PATTERN.test(body) || STRONG_FACT_PATTERN.test(body);
  }
  if (BOOK_TITLE_PATTERN.test(content)) return true;
  QUOTE_PATTERN.lastIndex = 0;
  if (QUOTE_PATTERN.test(content)) return true;
  return FACTUAL_CLAIM_HINT_PATTERN.test(content);
}
