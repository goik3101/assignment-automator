// 책 후보 제목에서 괄호 안 다른 이름을 뗀다(alias import 없음 — 테스트용).
// 2026-11-19 결과물: 『내 이름은 라임오렌지나무 (나의 라임 오렌지나무)』 — 후보 선정이 같은 책의 두 번역명을 한 제목으로 합쳐 줬고,
// 그 제목이 글·서지 칸·각주 검색·쏠림 집계(normalizeBookTitleKey)에 그대로 퍼졌다. 한 책이 두 이름으로 세어지면 억제도 새 나간다.
// 괄호 부분이 원제·다른 번역명·시리즈 표기든 본 제목만 남기면 서지 대조(저자)와 검색이 더 정확해진다.
export function mainBookTitle(title: string): string {
  const cleaned = title.replace(/\s*[(（][^)）]*[)）]/g, "").replace(/\s+/g, " ").trim();
  // 전부 괄호였거나 너무 짧아지면 원래 제목을 둔다.
  return cleaned.length >= 2 ? cleaned : title.trim();
}
