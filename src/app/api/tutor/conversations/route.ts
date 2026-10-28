import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { getSessionUser } from "@/lib/supabase/session-user";

// 사이드바 "작업 목록"(AI 튜터 화면)용: 제목·날짜만, 최근 대화 순. 표가 아직 없으면 빈 목록을 돌려준다.
export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const user = await getSessionUser(supabase);
    if (!user) return NextResponse.json({ conversations: [] });
    const { data, error } = await supabase.from("tutor_conversations").select("id, title, updated_at").order("updated_at", { ascending: false }).limit(30);
    if (error) return NextResponse.json({ conversations: [] });
    return NextResponse.json({ conversations: data ?? [] });
  } catch (err) {
    console.error("[/api/tutor/conversations] 조회 실패", err);
    return NextResponse.json({ conversations: [] });
  }
}
