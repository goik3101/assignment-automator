import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";

// F14: 문의/피드백 제출. 로그인 여부와 무관하게 받는다 (feedback_submissions의
// user_id는 nullable — 서비스 전용 채널이라 개인 계정과 엮이지 않아도 됨).
export async function POST(req: NextRequest) {
  const { message } = (await req.json()) as { message?: string };
  if (!message?.trim()) {
    return NextResponse.json({ error: "내용을 입력해주세요." }, { status: 400 });
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("feedback_submissions")
    .insert({ user_id: user?.id ?? null, message: message.trim() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
