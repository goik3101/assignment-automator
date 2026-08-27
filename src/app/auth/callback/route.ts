import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";

// 매직링크 이메일의 링크가 최종적으로 도착하는 곳. Supabase가 붙여준 `code`를
// 실제 로그인 세션으로 교환한다 (F10).
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (code) {
    const supabase = await getServerSupabase();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL("/", req.url));
}
