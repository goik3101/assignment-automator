// 책 후보 제목에서 괄호 안 다른 이름을 뗀다(alias import 없음 — 테스트용).
// 2026-11-19 결과물: 『내 이름은 라임오렌지나무 (나의 라임 오렌지나무)』 — 후보 선정이 같은 책의 두 번역명을 한 제목으로 합쳐 줬고,
// 그 제목이 글·서지 칸·각주 검색·쏠림 집계(normalizeBookTitleKey)에 그대로 퍼졌다. 한 책이 두 이름으로 세어지면 억제도 새 나간다.
// 괄호 부분이 원제·다른 번역명·시리즈 표기든 본 제목만 남기면 서지 대조(저자)와 검색이 더 정확해진다.
export function mainBookTitle(title: string): string {
  const cleaned = title.replace(/\s*[(（][^)）]*[)）]/g, "").replace(/\s+/g, " ").trim();
  // 전부 괄호였거나 너무 짧아지면 원래 제목을 둔다.
  return cleaned.length >= 2 ? cleaned : title.trim();
}

/**
 * 책 후보가 **책 제목으로 말이 되는가**. 후보 호출이 책 대신 안내 문장을 제목으로 돌려준 적이 두 번 있다 —
 * 2026-11-01 "온라인 자료 검색 허가 요청", 2026-11-22 역사-05 "예시 안내: 학교 수행평가에 바로 쓸 수 있는 자료 유형을 원하나요?"(본문에 "참고 도서는 『…』이다"로 들어갔다).
 * 질문·요청·존댓말 문장 꼴과 너무 긴 제목만 거른다 — "나는 누구인가?" 같은 짧은 의문형 제목은 그대로 둔다.
 */
export function isPlausibleBookTitle(title: string): boolean {
  const s = (title ?? "").trim();
  if (s.length < 1 || s.length > 60) return false;
  if (/(?:원하나요|드릴까요|하세요|해\s*주세요|입니다|합니다|있나요|할까요|허가\s*요청|검색\s*요청)[?？.!\s]*$/.test(s)) return false;
  if (/[?？]/.test(s) && s.length > 30) return false;
  if (/^(?:예시|안내|요청|죄송|알겠)/.test(s)) return false;
  return true;
}

/**
 * 모델이 모르는 책을 얼버무린 후보("넬슨의 화학이야기 번역본(일상 속 화학 설명서류)", "원소로 보는 세계사(또는 원소 중심 교양서)").
 * 실제 제목에는 "또는"·"~류)"·"번역본"이 안 붙는다 — 이런 후보를 책으로 골랐다가 지은이·출판사·구절을 하나도 못 찾아 빈칸 2개·출처 0개·54초·$0.15가 됐다(2026-11-27 과학-03 화학II, 사진 대조).
 * "주기율표(The Periodic Table)"처럼 영어 원제 괄호는 그대로 둔다. BOOK_HEDGE=off로 끈다.
 */
export function looksHedgedBookTitle(title: string): boolean {
  if (process.env.BOOK_HEDGE === "off") return false;
  const s = (title ?? "").trim();
  return /또는|[(（][^)）]*(?:류|종류|등|설명서|입문서|교양서|추천서|시리즈물)[)）]|번역본\s*$|번역본\s*[(（]/.test(s);
}
