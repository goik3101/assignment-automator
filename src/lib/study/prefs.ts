// 공부 도구 AI 설정(설정 > AI 설정): 퀴즈·플래시카드·요약을 어떻게 만들지. 계정 없이도 쓰도록 브라우저에 저장하고,
// 만들 때 요청 본문으로 보낸다. 서버는 같은 sanitize 함수로 값을 다시 검사한다(순수 함수 — alias import 없음).

export type QuizType = "choice" | "ox" | "short" | "blank";
export type QuizDifficulty = "easy" | "normal" | "hard";
export type QuizDepth = "basic" | "deep";
export type SummaryDetail = "brief" | "standard" | "detailed";
export type SummaryFormat = "bullets" | "prose";

export interface QuizPrefs {
  types: QuizType[];
  difficulty: QuizDifficulty;
  depth: QuizDepth;
  count: number;
}
export interface FlashcardPrefs {
  count: number;
}
export interface SummaryPrefs {
  detail: SummaryDetail;
  format: SummaryFormat;
  easy: boolean;
}
export interface StudyPrefs {
  quiz: QuizPrefs;
  flashcards: FlashcardPrefs;
  summary: SummaryPrefs;
}

export const QUIZ_TYPES: QuizType[] = ["choice", "ox", "short", "blank"];
export const QUIZ_COUNT = { min: 1, max: 30 };
export const FLASHCARD_COUNT = { min: 1, max: 50 };

export const DEFAULT_STUDY_PREFS: StudyPrefs = {
  // 기본은 **단답형 + 빈칸**이다(2026-11-13 결정). 수행평가는 백지에서 꺼내 쓰는 시험이라,
  // 보기를 고르는 연습만 하면 "알 것 같은데 안 써진다"가 된다 — 선택형·OX는 학생이 직접 켠다.
  quiz: { types: ["short", "blank"], difficulty: "normal", depth: "basic", count: 10 },
  flashcards: { count: 10 },
  summary: { detail: "standard", format: "bullets", easy: false },
};

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function sanitizeQuizPrefs(v: unknown): QuizPrefs {
  const o = rec(v);
  const d = DEFAULT_STUDY_PREFS.quiz;
  const types = Array.isArray(o.types) ? QUIZ_TYPES.filter((t) => (o.types as unknown[]).includes(t)) : [];
  // **옛 기본값(네 유형 전부)이 저장된 것은 "고른 적 없음"으로 본다**(2026-11-13).
  // 설정은 브라우저에 저장되므로, 기본값만 바꾸면 이미 설정 화면을 열어 본 사람에게는 영원히 안 먹는다.
  // 네 개를 **다** 켜 둔 것은 예전 기본값 그대로라는 뜻이라 새 기본값(빈칸·단답)으로 옮긴다 —
  // 일부만 고른 사람은 직접 고른 것이므로 그대로 둔다.
  const keptOldDefault = types.length === QUIZ_TYPES.length;
  return {
    // 하나도 안 고르면 문제를 낼 수 없으므로 기본값으로 돌린다.
    types: types.length && !keptOldDefault ? types : [...d.types],
    difficulty: oneOf(o.difficulty, ["easy", "normal", "hard"], d.difficulty),
    depth: oneOf(o.depth, ["basic", "deep"], d.depth),
    count: clampInt(o.count, QUIZ_COUNT.min, QUIZ_COUNT.max, d.count),
  };
}

export function sanitizeFlashcardPrefs(v: unknown): FlashcardPrefs {
  return { count: clampInt(rec(v).count, FLASHCARD_COUNT.min, FLASHCARD_COUNT.max, DEFAULT_STUDY_PREFS.flashcards.count) };
}

export function sanitizeSummaryPrefs(v: unknown): SummaryPrefs {
  const o = rec(v);
  const d = DEFAULT_STUDY_PREFS.summary;
  return {
    detail: oneOf(o.detail, ["brief", "standard", "detailed"], d.detail),
    format: oneOf(o.format, ["bullets", "prose"], d.format),
    easy: typeof o.easy === "boolean" ? o.easy : d.easy,
  };
}

export function sanitizeStudyPrefs(v: unknown): StudyPrefs {
  const o = rec(v);
  return { quiz: sanitizeQuizPrefs(o.quiz), flashcards: sanitizeFlashcardPrefs(o.flashcards), summary: sanitizeSummaryPrefs(o.summary) };
}

/** 같은 설정으로 만든 자료인지 비교하는 문자열 — 설정을 바꾼 뒤 "만들기"를 누르면 저장된 옛 자료 대신 새로 만든다. */
export function prefsSignature(p: QuizPrefs | FlashcardPrefs | SummaryPrefs): string {
  return JSON.stringify(p);
}

const KEY = "studed-study-prefs";

export function loadStudyPrefs(): StudyPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return sanitizeStudyPrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeStudyPrefs(null);
  }
}

export function saveStudyPrefs(p: StudyPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // 저장소를 못 쓰면 이번 방문에만 적용된다.
  }
}

export function resetStudyPrefs() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** 고른 문제 유형에 문항 수를 고르게 나눈다(나머지는 앞 유형부터). 0문항인 유형은 뺀다. */
export function quizTypePlan(types: QuizType[], count: number): { type: QuizType; n: number }[] {
  const list = QUIZ_TYPES.filter((t) => types.includes(t));
  if (!list.length || count < 1) return [];
  const base = Math.floor(count / list.length);
  const rest = count % list.length;
  return list.map((type, i) => ({ type, n: base + (i < rest ? 1 : 0) })).filter((x) => x.n > 0);
}
