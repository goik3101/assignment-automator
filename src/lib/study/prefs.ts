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
  // 네 유형을 다 쓰고 **객관식을 가장 많이** 낸다(QUIZ_TYPE_WEIGHT, 2026-11-13).
  // 우리 객관식은 **빈칸에 들어갈 말 고르기**를 포함해 타이핑 없이 문맥을 읽게 하고,
  // 백지에서 꺼내는 연습은 단답·빈칸이 맡는다. 10문제면 객관식 4 · OX 2 · 단답 2 · 빈칸 2다.
  quiz: { types: [...QUIZ_TYPES], difficulty: "normal", depth: "basic", count: 10 },
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
  // (2026-11-13 오전에 "네 유형 전부 = 옛 기본값이니 빈칸·단답으로 옮긴다"를 넣었다가 같은 날 되돌렸다.
  //  객관식이 **빈칸 고르기**를 포함하게 되면서 네 유형을 다 쓰는 쪽이 기본이 됐기 때문이다 — 이제 옮길 곳이 없다.)
  return {
    // 하나도 안 고르면 문제를 낼 수 없으므로 기본값으로 돌린다.
    types: types.length ? types : [...d.types],
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
/**
 * 유형별 **비중**. 객관식이 가장 많다(2026-11-13 결정): 보기를 고르는 문제는 한 손으로 풀려서
 * "간편·빠르게"에 맞고, 우리 객관식은 그냥 사지선다뿐 아니라 **빈칸에 들어갈 말을 고르는 문제**도 포함한다
 * (문장 안에서 골라야 해서 그냥 객관식보다 낫고, 타이핑이 없다).
 * 10문제 기준 대략 객관식 4 · 빈칸 2 · OX 2 · 단답 2가 된다.
 */
const QUIZ_TYPE_WEIGHT: Record<QuizType, number> = { choice: 2, blank: 1, ox: 1, short: 1 };

export function quizTypePlan(types: QuizType[], count: number): { type: QuizType; n: number }[] {
  const list = QUIZ_TYPES.filter((t) => types.includes(t));
  if (!list.length || count < 1) return [];
  const total = list.reduce((s, t) => s + QUIZ_TYPE_WEIGHT[t], 0);
  // 먼저 비중대로 내림해서 나누고, 남는 문항은 비중이 큰 유형부터 하나씩 더 준다.
  const plan = list.map((type) => ({ type, n: Math.floor((count * QUIZ_TYPE_WEIGHT[type]) / total) }));
  let rest = count - plan.reduce((s, p) => s + p.n, 0);
  const order = [...plan].sort((a, b) => QUIZ_TYPE_WEIGHT[b.type] - QUIZ_TYPE_WEIGHT[a.type]);
  for (let i = 0; rest > 0; i = (i + 1) % order.length, rest--) order[i].n += 1;
  return plan.filter((x) => x.n > 0);
}
