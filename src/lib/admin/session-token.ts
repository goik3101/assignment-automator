import { createHmac, timingSafeEqual } from "crypto";

// 관리자 세션 쿠키 값(서명된 토큰)만 다루는 파일 — next/headers 등에 의존하지 않아 proxy.ts와 테스트에서 그대로 쓴다.
// 토큰 형식: "만료시각.서명".
export const ADMIN_COOKIE_NAME = "studed_admin_session";

/** 관리자 ID·비밀번호로 로그인하면 이 예약 계정으로도 실제 Supabase 세션을 함께
 * 발급한다 — 로그인해야만 쓸 수 있는 기능(개인화 설정, 히스토리 등)을
 * 관리자도 그대로 쓸 수 있어야 하는데, 그 기능들은 전부 RLS(auth.uid())
 * 기반이라 진짜 로그인 상태가 아니면 원천적으로 동작하지 않는다. 실제
 * 사용자 계정과 절대 겹치지 않도록 일반 이메일이 쓸 수 없는 내부 전용
 * 도메인을 쓴다. */
export const ADMIN_ACCOUNT_EMAIL = "studed-admin@internal.studed.local";

// 로그인하고 8시간이 지나면 관리자 로그인이 끝난다(쓰는 중이어도 연장되지 않는다). 끝나면 proxy.ts가 예약 계정의 Supabase 세션도 함께 끊는다.
export const SESSION_MS = 8 * 60 * 60 * 1000;
export const ADMIN_SESSION_MAX_AGE_SECONDS = SESSION_MS / 1000;

// 세션 서명 키. ADMIN_SESSION_SECRET을 따로 두면 로그인 비밀번호가 서명 키를 겸하지 않는다(비밀번호가 새도 세션을 위조할 수 없고,
// 반대로 키를 바꿔 모든 관리자 세션을 한꺼번에 끊을 수도 있다). 없으면 ADMIN_LOGIN_PASSWORD를 쓴다.
function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_LOGIN_PASSWORD;
  if (!secret) throw new Error("ADMIN_LOGIN_PASSWORD가 설정되어 있지 않습니다.");
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

/** 관리자 세션 쿠키 값을 만든다. 서버에서 발급하는 값이라 비밀번호 자체는 쿠키에 담기지 않는다. */
export function createAdminSessionToken(now = Date.now()): string {
  const payload = String(now + SESSION_MS);
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminSessionToken(token: string | undefined | null, now = Date.now()): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  return Number(payload) > now;
}

export function adminCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
    path: "/",
  };
}
