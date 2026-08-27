import { NextRequest, NextResponse } from "next/server";
import { createAdminSessionToken, ADMIN_COOKIE_NAME, ADMIN_SESSION_MAX_AGE_SECONDS } from "@/lib/admin/session";
import { isLockedOut, recordAttempt } from "@/lib/admin/lockout";

function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

// F12/11-6: 관리자 코드 로그인. 코드는 서버 환경변수(ADMIN_LOGIN_CODE)로만 보관하고,
// 반복 실패 시 IP 기준으로 잠근다.
export async function POST(req: NextRequest) {
  const adminCode = process.env.ADMIN_LOGIN_CODE;
  if (!adminCode) {
    return NextResponse.json({ error: "관리자 로그인이 설정되어 있지 않습니다." }, { status: 500 });
  }

  const ip = getClientIp(req);
  if (await isLockedOut(ip)) {
    return NextResponse.json(
      { error: "로그인 시도가 너무 많아 일시적으로 잠겼습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 }
    );
  }

  const { code } = (await req.json()) as { code?: string };
  const success = code === adminCode;
  await recordAttempt(ip, success);

  if (!success) {
    return NextResponse.json({ error: "코드가 일치하지 않습니다." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, createAdminSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}
