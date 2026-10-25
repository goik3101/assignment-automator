import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { ADMIN_ACCOUNT_EMAIL, ADMIN_COOKIE_NAME, verifyAdminSessionToken } from "./session-token";

// 토큰 발급·검증은 session-token.ts(next/headers 의존 없음 — proxy.ts와 테스트에서 쓴다). 여기서는 기존 import 경로를 그대로 두려고 다시 내보낸다.
export {
  ADMIN_ACCOUNT_EMAIL,
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  adminCookieOptions,
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "./session-token";

/** 관리자 로그인이 서버에 설정돼 있는지(ID와 비밀번호가 모두 있어야 한다). */
export function adminLoginConfigured(): boolean {
  return !!process.env.ADMIN_LOGIN_ID && !!process.env.ADMIN_LOGIN_PASSWORD;
}

/**
 * 입력한 ID·비밀번호가 맞는지. 해시한 값끼리 상수 시간으로 비교하고, 어느 쪽이 틀렸는지 시간 차이로 새지 않게
 * 둘 다 항상 끝까지 비교한다.
 */
export function adminCredentialsMatch(id: unknown, password: unknown): boolean {
  const expectedId = process.env.ADMIN_LOGIN_ID;
  const expectedPassword = process.env.ADMIN_LOGIN_PASSWORD;
  if (!expectedId || !expectedPassword || typeof id !== "string" || typeof password !== "string") return false;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  const idOk = timingSafeEqual(digest(id), digest(expectedId));
  const passwordOk = timingSafeEqual(digest(password), digest(expectedPassword));
  return idOk && passwordOk;
}

export function isAdminRequest(req: NextRequest): boolean {
  return verifyAdminSessionToken(req.cookies.get(ADMIN_COOKIE_NAME)?.value);
}

/**
 * 횟수 제한 면제 여부. 관리자 세션이 끝나면 proxy.ts가 예약 계정의 Supabase 세션도 함께 끊지만, 그 직전 요청이 일반 사용자로 보여
 * 하루 2회 제한에 걸리지 않도록 서버가 검증한 로그인 사용자의 이메일이 예약 계정이면 제한만 면제한다. 관리자 대시보드·통계·공지는 계속 쿠키(isAdminRequest)로만 연다.
 * 예약 계정은 관리자 로그인으로만 세션을 얻는다(내부 도메인이라 메일을 받을 수 없음).
 */
export function isLimitExempt(req: NextRequest, email?: string | null): boolean {
  return isAdminRequest(req) || (!!email && email === ADMIN_ACCOUNT_EMAIL);
}

/** 관리자 전용 Server Component 페이지 맨 위에서 호출한다 — 세션이 없으면
 * 로그인 화면으로 보내고, 있으면 그냥 반환한다(admin/page.tsx가 이미 쓰던
 * 인라인 검사를 새 관리자 페이지들과 공유하기 위해 뽑아낸 것). */
export async function requireAdminOrRedirect(): Promise<void> {
  const cookieStore = await cookies();
  const isValid = verifyAdminSessionToken(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
  if (!isValid) redirect("/admin/login");
}
