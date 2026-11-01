// 책 추천/선정 단계가 필요한 과제인지 판별하는 패턴.
// '책'은 독립된 단어일 때만 본다 — 정책·책임·대책·해결책 같은 낱말 속의 '책'에 걸려 불필요한 책 후보 검색(약 30초·검색 비용)이 돌던 문제를 막는다. '책처방'류는 포함한다.
export const BOOK_TASK_HINT_PATTERN = /(?<![가-힣])책(?=[을이은는의과와도에]|처방|\s|$|[,.)])|도서|서적|독서/;

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

const SPLIT = /(?<=[.!?。])\s+|\n+/;

/** 자료 출처 나열 문장을 뺀 나머지에서만 "책 과제인가"를 본다. */
export function mentionsBookTask(text: string): boolean {
  if (!text) return false;
  return text
    .split(SPLIT)
    .some((s) => s.trim() && !isSourceListSentence(s) && BOOK_TASK_HINT_PATTERN.test(s));
}
