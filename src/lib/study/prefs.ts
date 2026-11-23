// 공부 도구 AI 설정(설정 > AI 설정): 요약·암기를 어떻게 만들지. 계정 없이도 쓰도록 브라우저에 저장하고,
// 만들 때 요청 본문으로 보낸다. 서버는 같은 sanitize 함수로 값을 다시 검사한다(순수 함수 — alias import 없음).
//
// 2026-11-23: 퀴즈·플래시카드 설정은 두 도구가 요약 한 번의 결과를 코드로 나눠 쓰게 되면서 없앴다(옛 값이 브라우저에 남아 있어도 무시한다).
// summary.format은 더 이상 쓰지 않지만 **지우지 않는다** — prefsSignature가 이 객체의 JSON이라 필드를 빼면 모든 사용자의 저장된 요약이 "설정이 달라졌다"고 보고 다시 만들게 된다(하루 1회 한도를 쓴다).

export type SummaryDetail = "brief" | "standard" | "detailed";
export type SummaryFormat = "bullets" | "prose";

export interface SummaryPrefs {
  detail: SummaryDetail;
  /** 쓰지 않는다(서명 호환용). */
  format: SummaryFormat;
  easy: boolean;
}
export interface MemorizePrefs {
  /** 핵심어 첫 글자를 이어 붙인 두음 암기 보조를 보여 줄지. */
  mnemonic: boolean;
}
export interface StudyPrefs {
  summary: SummaryPrefs;
  memorize: MemorizePrefs;
}

export const DEFAULT_STUDY_PREFS: StudyPrefs = {
  summary: { detail: "standard", format: "bullets", easy: false },
  memorize: { mnemonic: true },
};

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

export function sanitizeSummaryPrefs(v: unknown): SummaryPrefs {
  const o = rec(v);
  const d = DEFAULT_STUDY_PREFS.summary;
  return {
    detail: oneOf(o.detail, ["brief", "standard", "detailed"], d.detail),
    format: oneOf(o.format, ["bullets", "prose"], d.format),
    easy: typeof o.easy === "boolean" ? o.easy : d.easy,
  };
}

export function sanitizeMemorizePrefs(v: unknown): MemorizePrefs {
  const o = rec(v);
  return { mnemonic: typeof o.mnemonic === "boolean" ? o.mnemonic : DEFAULT_STUDY_PREFS.memorize.mnemonic };
}

export function sanitizeStudyPrefs(v: unknown): StudyPrefs {
  const o = rec(v);
  return { summary: sanitizeSummaryPrefs(o.summary), memorize: sanitizeMemorizePrefs(o.memorize) };
}

/** 같은 설정으로 만든 자료인지 비교하는 문자열 — 설정을 바꾼 뒤 "만들기"를 누르면 저장된 옛 자료 대신 새로 만든다. */
export function prefsSignature(p: SummaryPrefs | MemorizePrefs): string {
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
