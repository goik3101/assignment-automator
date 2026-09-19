import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";

// 휴지통에서 복원.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/histories/[id]/restore">) {
  try {
    const { id } = await ctx.params;
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const { data: row } = await supabase
      .from("user_histories")
      .select("submission_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: "히스토리를 찾을 수 없습니다." }, { status: 404 });

    const { error } = await supabase.from("trashed_histories").delete().eq("submission_id", row.submission_id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/histories/[id]/restore] 실패", err);
    return NextResponse.json({ error: "복원하지 못했어요." }, { status: 500 });
  }
}
