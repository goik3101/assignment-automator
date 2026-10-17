// 화면 언어(한국어/영어) 공통 로직. alias import 없음 — node:test에서 바로 불러올 수 있게.
// 원칙: 한국어 원문을 키로 쓴다. t("새 창작물") → 영어일 때 사전에서 찾고, 없으면 한국어 그대로 보여 준다(깨지지 않는다).
// 문구에 값이 들어가면 "{n}개"처럼 자리표시자를 쓰고 t("{n}개", { n: 3 })로 채운다.
export type Lang = "ko" | "en";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "ko", label: "한국어" },
  { id: "en", label: "English" },
];
export const LANG_COOKIE = "studed-lang";

export function parseLang(v: unknown): Lang {
  return v === "en" ? "en" : "ko";
}

export function translate(
  lang: Lang,
  dict: Record<string, string>,
  ko: string,
  vars?: Record<string, string | number>
): string {
  const base = lang === "en" ? (dict[ko] ?? ko) : ko;
  if (!vars) return base;
  return base.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** 브라우저 언어가 영어이면 en, 아니면 ko — 처음 방문 때만 쓴다. */
export function detectLang(acceptLanguage: string | null | undefined): Lang {
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("en") ? "en" : "ko";
}
