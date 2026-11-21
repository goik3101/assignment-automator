// 책 추천/선정 단계가 필요한 과제인지 판별하는 패턴.
// '책'은 독립된 단어일 때만 본다 — 정책·책임·대책·해결책 같은 낱말 속의 '책'에 걸려 불필요한 책 후보 검색(약 30초·검색 비용)이 돌던 문제를 막는다. '책처방'류는 포함한다.
export const BOOK_TASK_HINT_PATTERN = /(?<![가-힣])책(?=[을이은는의과와도에]|처방|\s|$|[,.)])|도서(?!관|산간|·\s*산간)|서적|독서(?!실)/;

// 안내문이 **어디서 찾아라**를 나열한 문장은 과제의 소재가 아니다.
// 실측(2026-11-01, 통합사회2 인권 저널): "인터넷 검색(백과사전, 신문기사, 인물 평전, 책 내용 등)을 통해
// 관련된 내용을 수집할 것"의 "책 "이 책 과제 판정을 켰다. 그러자 책 후보 검색이 돌아 모델이
// "온라인 자료 검색 허가 요청" 같은 것을 책 제목이라고 내놨고 → 책 조사 실패 → 대체 경로 →
// **출처 0개·각주 0개짜리 신문**이 나왔다(그 글에 "우리는 기계가 아니다" 같은 인용까지 들어 있었다).
// 자료 출처 종류를 늘어놓는 문장에서는 '책'이 소재가 아니라 **찾아볼 곳 중 하나**다.
const SOURCE_KIND = /백과사전|평전|누리집|신문\s*기사|인터넷\s*검색|학술\s*논문|포털/;
const SEARCH_VERB = /검색|수집|참고|조사|찾아|활용/;

/** 이 문장이 "자료를 어디서 찾을지" 나열한 문장인가. */
export function isSourceListSentence(sentence: string): boolean {
  return SOURCE_KIND.test(sentence) && SEARCH_VERB.test(sentence);
}

// 책이 **소재**가 아니라 **참고 목록에 적는 항목**인 문장은 책 과제가 아니다: "참고한 도서를 기록한다", "참고문헌(도서·논문·기사)을 정리한다", "출처(도서·신문기사)를 밝힌다".
// 이걸 책 과제로 읽으면 책 후보 선정·서지 확인(30~50초+)이 돌고 결과물이 "신용하의 평전을 참고해 확인했다"처럼 학생이 하지 않은 일을 쓴다(역사-05 실측 2026-11-21).
// 읽기·고르기·소개·요약처럼 책이 글의 재료가 되는 동사가 함께 있으면 예전대로 책 과제다 — 애매하면 책 과제로 남긴다(놓치는 쪽이 오탐보다 싸다: 놓쳐도 본문 생성이 책을 직접 고른다).
// 판정은 낱말 한 개가 아니라 세 가지가 **모두** 맞을 때만이다: 참고 목록을 가리키는 말 + 적는 동사 + 읽기·활용 동사 없음. 감사: scripts/measure/rule-audit.ts "책과제".
const REF_CUE = /참고(?:\s*(?:문헌|자료|도서)|(?:한|하여|할|해)?\s*(?:도서|서적|책|문헌))|출처|(?:사용|활용|이용)한\s*(?:도서|서적|자료)/;
const RECORD_VERB = /기록|기재|적는|적을|적어|작성|명시|밝히|밝힌|밝혀|정리|표기|제시|나열/;
const READ_OR_USE_VERB = /읽|선정|고르|골라|추천|소개|처방|감상|독후|독서\s*(?:활동|탐구|감상)|바탕|토대|요약|분석|인용|내용/;

/** 이 문장이 "참고 목록에 적는 항목"을 말하는가(책이 소재가 아니다). */
export function isReferenceListSentence(sentence: string): boolean {
  return REF_CUE.test(sentence) && RECORD_VERB.test(sentence) && !READ_OR_USE_VERB.test(sentence);
}

const SPLIT = /(?<=[.!?。])\s+|\n+/;

/** 자료 출처 나열 문장을 뺀 나머지에서만 "책 과제인가"를 본다. */
export function mentionsBookTask(text: string): boolean {
  if (!text) return false;
  return text
    .split(SPLIT)
    .some((s) => s.trim() && !isSourceListSentence(s) && !(process.env.REFERENCE_BOOK_TASK !== "legacy" && isReferenceListSentence(s)) && BOOK_TASK_HINT_PATTERN.test(s));
}
