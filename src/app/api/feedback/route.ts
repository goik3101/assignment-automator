import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { LIMITS, checkText } from "@/lib/api/validate";

// F14: 문의/피드백 제출. 로그인 여부와 무관하게 받는다 (feedback_submissions의
// user_id는 nullable — 서비스 전용 채널이라 개인 계정과 엮이지 않아도 됨).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message : "";
  if (!message.trim()) {
    return NextResponse.json({ error: "내용을 입력해주세요." }, { status: 400 });
  }
  const tooLong = checkText(message, LIMITS.feedback, "내용");
  if (tooLong) return NextResponse.json({ error: tooLong }, { status: 400 });

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("feedback_submissions")
    .insert({ user_id: user?.id ?? null, message: message.trim() });
  if (error) {
    console.error("[/api/feedback] 저장 실패", error);
    return NextResponse.json({ error: "전달하지 못했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
