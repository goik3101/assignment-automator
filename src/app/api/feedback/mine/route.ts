import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { listMyFeedback } from "@/lib/feedback/reply";

// 내가 "이메일로 보내기"를 골라 보낸 피드백과 개발자 답변. 본인(user_id) 것만 돌려준다 — 익명으로 보낸 것은 계정과 이어져 있지 않아 나오지 않는다.
export async function GET() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ items: [] });
  try {
    return NextResponse.json({ items: await listMyFeedback(user.id) });
  } catch (err) {
    console.error("[/api/feedback/mine]", err);
    return NextResponse.json({ items: [] });
  }
}
