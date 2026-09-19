import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";

// 홈 대시보드("수행평가 및 과제")용 내 결과물 목록 — 읽기 전용. 세션 클라이언트(RLS)로만
// 조회하므로 본인 것만 나온다. 비로그인이면 빈 목록(에러 아님).
export async function GET() {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ histories: [] });

    const { data, error } = await supabase
      .from("user_histories")
      .select("id, title, subject, output_type, created_at")
      .eq("is_current", true)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw error;
    return NextResponse.json({ histories: data ?? [] });
  } catch (err) {
    console.error("[/api/histories] 목록 조회 실패", err);
    return NextResponse.json({ error: "목록을 불러오지 못했어요." }, { status: 500 });
  }
}
