import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

export const ADMIN_COOKIE_NAME = "studed_admin_session";
// 11-6: "세션 짧은 만료"
const SESSION_MAX_AGE_MS = 30 * 60 * 1000; // 30분

/** 관리자 코드로 로그인하면 이 예약 계정으로도 실제 Supabase 세션을 함께
 * 발급한다 — 로그인해야만 쓸 수 있는 기능(개인화 설정, 히스토리 등)을
 * 관리자도 그대로 쓸 수 있어야 하는데, 그 기능들은 전부 RLS(auth.uid())
 * 기반이라 진짜 로그인 상태가 아니면 원천적으로 동작하지 않는다. 실제
 * 사용자 계정과 절대 겹치지 않도록 일반 이메일이 쓸 수 없는 내부 전용
 * 도메인을 쓴다. */
export const ADMIN_ACCOUNT_EMAIL = "studed-admin@internal.studed.local";

function getSecret(): string {
  const code = process.env.ADMIN_LOGIN_CODE;
  if (!code) throw new Error("ADMIN_LOGIN_CODE가 설정되어 있지 않습니다.");
  return code;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

/** 관리자 세션 쿠키 값을 만든다: "만료시각.서명" 형태. 서버에서 발급하는 값이라
 * 로그인 코드 자체는 쿠키에 담기지 않는다. */
export function createAdminSessionToken(): string {
  const expiresAt = Date.now() + SESSION_MAX_AGE_MS;
  const payload = String(expiresAt);
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminSessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  return Number(payload) > Date.now();
}

export function isAdminRequest(req: NextRequest): boolean {
  return verifyAdminSessionToken(req.cookies.get(ADMIN_COOKIE_NAME)?.value);
}

/**
 * 횟수 제한 면제 여부. 관리자 코드 쿠키는 30분 뒤 만료되지만 예약 계정의 Supabase 로그인은 계속 남는다 —
 * 그 상태에서 서버가 일반 사용자로 보고 하루 2회 제한을 걸던 문제를 막기 위해, 서버가 검증한 로그인 사용자의 이메일이
 * 예약 계정이면 제한만 면제한다. 관리자 대시보드·통계·공지는 계속 쿠키(isAdminRequest)로만 연다.
 * 예약 계정은 관리자 코드 로그인으로만 세션을 얻는다(내부 도메인이라 메일을 받을 수 없음).
 */
export function isLimitExempt(req: NextRequest, email?: string | null): boolean {
  return isAdminRequest(req) || (!!email && email === ADMIN_ACCOUNT_EMAIL);
}

export const ADMIN_SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000;

/** 관리자 전용 Server Component 페이지 맨 위에서 호출한다 — 세션이 없으면
 * 로그인 화면으로 보내고, 있으면 그냥 반환한다(admin/page.tsx가 이미 쓰던
 * 인라인 검사를 새 관리자 페이지들과 공유하기 위해 뽑아낸 것). */
export async function requireAdminOrRedirect(): Promise<void> {
  const cookieStore = await cookies();
  const isValid = verifyAdminSessionToken(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
  if (!isValid) redirect("/admin/login");
}
