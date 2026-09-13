import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/admin/session";
import { getServerSupabase } from "@/lib/supabase/server-client";

export async function POST() {
  // 로그인 때 예약 계정으로 함께 발급한 Supabase 세션도 같이 끊는다 —
  // 안 그러면 관리자 배지는 사라졌는데 예약 계정으로는 로그인된 채로
  // 남아 있는 혼란스러운 상태가 될 수 있다.
  try {
    const supabase = await getServerSupabase();
    await supabase.auth.signOut();
  } catch (err) {
    console.error("[/api/admin/logout] 관리자 예약 계정 로그아웃 실패", err);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(ADMIN_COOKIE_NAME);
  return response;
}
