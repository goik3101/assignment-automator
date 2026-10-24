import type { NextRequest } from "next/server";
import { LANG_COOKIE, parseLang } from "@/lib/i18n/core";
import { withOutputLang } from "./output-lang";

/** 원고·계획 생성 라우트를 감싸 화면 언어(쿠키)를 결과물 언어로 넘긴다 — 안쪽의 모든 생성 호출이 currentOutputLang()으로 본다. */
export function withUiLangRoute<A extends unknown[]>(handler: (req: NextRequest, ...rest: A) => Promise<Response>) {
  return (req: NextRequest, ...rest: A): Promise<Response> =>
    withOutputLang(parseLang(req.cookies.get(LANG_COOKIE)?.value), () => handler(req, ...rest));
}
