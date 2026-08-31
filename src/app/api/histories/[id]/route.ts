import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";

// 히스토리 삭제. 세션 클라이언트(RLS)로만 지운다 — service-client를 쓰면
// "본인 것만 지운다"는 보장이 깨진다(다른 유저 히스토리도 지울 수 있게 됨).
// user_histories_delete_own 정책(supabase/migrations/0009)이 auth.uid() =
// user_id인 행만 삭제를 허용하므로, 다른 사람의 id를 넣으면 0행 삭제로 끝난다.
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/histories/[id]">) {
  try {
    const { id } = await ctx.params;
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const { error, count } = await supabase
      .from("user_histories")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw error;
    if (!count) return NextResponse.json({ error: "히스토리를 찾을 수 없습니다." }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/histories/[id]] 삭제 실패", err);
    return NextResponse.json({ error: "삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}
