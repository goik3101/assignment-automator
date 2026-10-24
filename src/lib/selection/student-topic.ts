// 학생이 이미 정한 주제·대상을 지침에서 코드로 찾는다(자동 선정보다 먼저). alias import 없음 — node:test에서 바로 불러올 수 있게.
// 실측(2026-10-24): 지침에 "청소년 SNS 사용 시간 제한 찬성"을 정해 두었는데 AI 판정이 이를 못 알아봐 자동 선정이 "iOS 스크린 타임 기능"으로
// 바꿔 버렸고, 다른 실행에서는 주제 대신 매체("슬라이드(파워포인트/구글슬라이드)")를 학생이 고른 대상으로 잡았다.

/** 무엇을 다룰지(주제·대상)를 묻는 질문/항목. */
const TOPIC_Q = /주제|인물|대상|소재|사례|사건|작품|기업|국가|지역|정책|쟁점|사회\s*문제|다룰|탐구할/;
/** 어떻게 만들지(매체·형식)를 묻는 질문 — 주제가 아니다. */
const MEDIUM_Q = /매체|형식|방식|도구|프로그램|플랫폼|분량|시간|디자인|구성|순서|말투|어조|자료\s*형태|발표\s*방법/;
/** 책은 책 선정(presetBook)이 따로 맡는다. */
const BOOK_Q = /책|도서|작가/;
/** 매체·형식 이름 — 값 전체가 이것들로만 이루어진 답은 주제가 아니다("신문 기사 속 혐오 표현"처럼 매체 이름으로 시작하는 주제는 주제다). */
const MEDIUM_WORD = /^(?:슬라이드|파워포인트|PPT|구글슬라이드|구글|프레젠테이션|키노트|프레지|캔바|영상|동영상|유튜브|포스터|카드뉴스|카드|뉴스|인포그래픽|리플릿|팸플릿|신문|보고서|만화|웹툰|그림|사진|활용|형식|자료|제작|발표)$/i;

function mediumOnly(value: string): boolean {
  const words = value
    .replace(/[(（][^)）]*[)）]/g, " ")
    .split(/[\s/,·]+/)
    .filter(Boolean);
  return words.length > 0 && words.every((w) => MEDIUM_WORD.test(w));
}
/** 찬성·반대 같은 입장만 있는 답은 주제가 아니다. */
const STANCE_ONLY = /^(?:찬성|반대|중립|찬성\s*측|반대\s*측)$/;

function usableAnswer(a: string): string | null {
  const t = a.trim().replace(/^["'“”‘’]|["'“”‘’]$/g, "").trim();
  if (t.length < 2 || t.length > 80) return null;
  if (t.startsWith("(")) return null; // "(학생이 나중에 직접 쓰겠다고 함)", "(학생이 AI에게 맡김)"
  if (mediumOnly(t) || STANCE_ONLY.test(t)) return null;
  return t;
}

/**
 * 지침에서 학생이 정한 주제·대상을 찾는다. 찾지 못하면 null.
 * - 제작 전 질문 답변(answersToInstructions 형식: "- 질문: …\n  답: …") 중 주제·대상을 묻는 질문의 답
 * - "발표 주제: …", "주제: …", "인물: …" 같은 항목 줄
 * "주제"를 직접 묻는 질문/항목을 먼저 고른다.
 */
export function findStudentTopic(instructions?: string | null): string | null {
  if (!instructions?.trim()) return null;
  const found: { value: string; rank: number }[] = [];

  for (const m of instructions.matchAll(/^\s*-\s*질문:\s*(.+)\n\s*답:\s*(.+)$/gm)) {
    const q = m[1];
    if (!TOPIC_Q.test(q) || MEDIUM_Q.test(q) || BOOK_Q.test(q)) continue;
    const v = usableAnswer(m[2]);
    if (v) found.push({ value: v, rank: /주제/.test(q) ? 0 : 1 });
  }
  for (const m of instructions.matchAll(/^\s*(?:[-*•]\s*)?((?:발표|탐구|연구|토론|글)?\s*주제|인물|대상|소재)\s*[:：]\s*(.+)$/gm)) {
    const v = usableAnswer(m[2]);
    if (v) found.push({ value: v, rank: /주제/.test(m[1]) ? 0 : 1 });
  }
  if (found.length === 0) return null;
  return found.sort((a, b) => a.rank - b.rank)[0].value;
}

/** AI가 "학생이 고른 대상"으로 뽑은 값이 매체·형식 이름뿐이면 대상이 아니다. */
export function isMediumOnly(value: string): boolean {
  return mediumOnly(value);
}
