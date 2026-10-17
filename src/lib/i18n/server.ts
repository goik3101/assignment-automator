import { cookies, headers } from "next/headers";
import { EN } from "./dict";
import { LANG_COOKIE, detectLang, parseLang, translate, type Lang } from "./core";

/** 서버 컴포넌트에서 현재 언어를 읽는다(쿠키 → 없으면 브라우저 언어). */
export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (c) return parseLang(c);
  return detectLang((await headers()).get("accept-language"));
}

/** 서버 컴포넌트용 번역 함수. */
export async function getT() {
  const lang = await getLang();
  return { lang, t: (ko: string, vars?: Record<string, string | number>) => translate(lang, EN, ko, vars) };
}
