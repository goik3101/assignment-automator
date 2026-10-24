// 한국어로 써야 하는 단계가 영어로 나오는 것을 막는다(실측 2026-10-24: 국어 "매체 활용 주제발표"의 발표 대본이 통째로 영어,
// 스토리보드 슬라이드 제목도 영어). 외국어 과목이 아닌 단계에만 쓴다. alias import 없음 — node:test에서 바로 불러올 수 있게.
// ESSAY_KOREAN_GUARD=off면 예전처럼 검사·재작성하지 않는다.

export function koreanGuardOn(): boolean {
  return process.env.ESSAY_KOREAN_GUARD !== "off";
}

/** 출처 줄·주소·각주 번호는 언어 판정에서 뺀다(영문 기사 제목·주소는 한국어 글에도 정상적으로 있다). */
function stripNonProse(content: string): string {
  return content
    .split("\n")
    .filter((l) => !/https?:\/\//.test(l))
    .join("\n")
    .replace(/\[\d+\]|\[F\d+\]/g, "");
}

export interface KoreanIssue {
  /** 라틴 문자 / (라틴 + 한글) — 한국어 글이면 보통 0.1 미만. */
  latinRatio: number;
  /** 영어 단어 4개 이상이 이어진 구간 수(영어 제목·문장). */
  englishRuns: number;
}

/** 한국어로 써야 하는 글에 영어 문장이 많거나(대본이 통째로 영어) 영어 제목·문장이 여러 번 섞였으면 문제를 돌려준다. */
export function koreanLanguageIssue(content: string): KoreanIssue | null {
  const text = stripNonProse(content);
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const hangul = (text.match(/[가-힣]/g) ?? []).length;
  if (latin + hangul < 40) return null;
  const latinRatio = latin / (latin + hangul);
  const englishRuns = (text.match(/[A-Za-z][A-Za-z'’-]*(?:[ \t]+[A-Za-z][A-Za-z'’-]*){3,}/g) ?? []).length;
  return latinRatio > 0.35 || englishRuns >= 3 ? { latinRatio: +latinRatio.toFixed(2), englishRuns } : null;
}

/** 분량 보정·부분 보완이 글의 언어를 바꿔 버렸는지(한국어 글 → 영어 글). */
export function flippedToEnglish(before: string, after: string): boolean {
  return !koreanLanguageIssue(before) && !!koreanLanguageIssue(after);
}

export function koreanRewritePrompt(label: string, content: string, description: string): string {
  return `
아래 글은 한국 고등학교 수행평가의 "${label}" 단계 원고다. 이 단계는 한국어로 제출해야 하는데 영어 문장이나 영어 제목이 섞여(또는 통째로 영어로) 쓰였다.
글 전체를 자연스러운 한국어로 다시 써줘.
- 내용·구성·순서·소제목(### 줄)은 그대로 두고, 영어 문장과 영어 제목·화면 문구를 모두 한국어로 바꿀 것.
- 외국 인물·기관·작품 이름은 한국어로 쓰고, 꼭 필요하면 처음 한 번만 괄호에 원어를 덧붙일 것.
- 각주 표기([1] 등)는 같은 내용의 문장 끝에 그대로 둘 것. 번호를 새로 만들거나 바꾸지 말 것.
- 새로운 사실·수치·연도·인용문을 더하지 말 것. 고등학생이 쓴 듯한 자연스러운 문장으로.
${description ? `- 이 단계가 다뤄야 할 내용: ${description}\n` : ""}결과는 고친 글 본문만 출력할 것(설명·머리말 없이).

[글]
${content}`.trim();
}

/** 재작성 결과를 받아도 되는지: 각주 번호가 그대로이고 더 이상 영어 글이 아니어야 한다. */
export function acceptKoreanRewrite(before: string, after: string): boolean {
  if (!after.trim()) return false;
  const marks = (t: string) => [...new Set(t.match(/\[\d+\]/g) ?? [])].sort().join(",");
  if (marks(before) !== marks(after)) return false;
  return !koreanLanguageIssue(after);
}
