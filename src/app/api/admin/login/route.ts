import { NextRequest, NextResponse } from "next/server";
import {
  createAdminSessionToken,
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  ADMIN_ACCOUNT_EMAIL,
} from "@/lib/admin/session";
import { isLockedOut, recordAttempt } from "@/lib/admin/lockout";
import { getServiceClient } from "@/lib/supabase/service-client";
import { getServerSupabase } from "@/lib/supabase/server-client";

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

  // 관리자는 개인화 설정·히스토리처럼 "로그인해야 쓸 수 있는" 기능도 그대로
  // 써야 하는데, 그 기능들은 전부 RLS(auth.uid()) 기반이라 진짜 Supabase
  // 세션 없이는 동작하지 않는다. 예약 계정으로 매직링크를 발급해서(계정이
  // 없으면 자동 생성됨) 즉시 검증까지 해버리는 방식 — 기존 매직링크 로그인과
  // 완전히 같은 경로라 히스토리/설정 등 다른 코드를 하나도 안 건드려도 된다.
  try {
    const serviceClient = getServiceClient();
    const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
      type: "magiclink",
      email: ADMIN_ACCOUNT_EMAIL,
    });
    const hashedToken = linkData?.properties?.hashed_token;
    if (linkError || !hashedToken) throw linkError ?? new Error("매직링크 생성 실패");

    const supabase = await getServerSupabase();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash: hashedToken,
    });
    if (verifyError) throw verifyError;
  } catch (err) {
    // 이 부분이 실패해도 관리자 코드 자체는 맞았으니 관리자 대시보드는
    // 그대로 쓸 수 있게 둔다 — 개인화/히스토리만 못 쓰는 정도로 완화 실패.
    console.error("[/api/admin/login] 관리자 예약 계정 로그인 실패(관리자 대시보드는 계속 이용 가능)", err);
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
