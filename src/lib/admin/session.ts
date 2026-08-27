import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export const ADMIN_COOKIE_NAME = "studed_admin_session";
// 11-6: "세션 짧은 만료"
const SESSION_MAX_AGE_MS = 30 * 60 * 1000; // 30분

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

export const ADMIN_SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000;
