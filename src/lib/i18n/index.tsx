"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { EN } from "./dict";
import { LANG_COOKIE, translate, type Lang } from "./core";

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (ko: string, vars?: Record<string, string | number>) => string;
}

const LangContext = createContext<Ctx>({ lang: "ko", setLang: () => {}, t: (ko, vars) => translate("ko", EN, ko, vars) });

/** layout.tsx(서버)가 쿠키에서 읽은 언어를 initial로 넘긴다 — 처음 그려질 때부터 맞는 언어라 깜빡임이 없다. */
export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = l;
    } catch {
      // 쿠키가 막힌 환경 — 이번 방문에서만 바뀐다.
    }
  }, []);
  const value = useMemo<Ctx>(() => ({ lang, setLang, t: (ko, vars) => translate(lang, EN, ko, vars) }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
export function useT() {
  return useContext(LangContext).t;
}
