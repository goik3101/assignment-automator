import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";

// 히스토리 삭제. 세션 클라이언트(RLS)로만 지운다 — service-client를 쓰면
// "본인 것만 지운다"는 보장이 깨진다(다른 유저 히스토리도 지울 수 있게 됨).
// user_histories_delete_own 정책(supabase/migrations/0009)이 auth.uid() =
// user_id인 행만 삭제를 허용하므로, 다른 사람의 id를 넣으면 0행 삭제로 끝난다.
//
// 기본 동작은 "휴지통으로 이동"(trashed_histories, 0014) — 복원할 수 있다. 휴지통 표가
// 아직 없으면(마이그레이션 미적용) 예전 동작(완전 삭제)으로 폴백한다. ?permanent=1이면
// (휴지통에서의 "영구 삭제") 같은 제출의 모든 버전을 완전히 지운다.
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/histories/[id]">) {
  try {
    const { id } = await ctx.params;
    const permanent = req.nextUrl.searchParams.get("permanent") === "1";
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const { data: row, error: findErr } = await supabase
      .from("user_histories")
      .select("submission_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!row) return NextResponse.json({ error: "히스토리를 찾을 수 없습니다." }, { status: 404 });

    if (!permanent) {
      const { error: trashErr } = await supabase
        .from("trashed_histories")
        .upsert({ submission_id: row.submission_id, user_id: user.id }, { onConflict: "submission_id", ignoreDuplicates: true });
      if (!trashErr) return NextResponse.json({ ok: true, trashed: true });
      console.warn("[/api/histories/[id]] 휴지통 표를 쓸 수 없어 완전 삭제로 폴백", trashErr.message);
    }

    // 완전 삭제: 영구 삭제면 같은 제출의 모든 버전, 폴백이면 예전처럼 그 행만.
    const q = supabase.from("user_histories").delete({ count: "exact" }).eq("user_id", user.id);
    const { error, count } = await (permanent ? q.eq("submission_id", row.submission_id) : q.eq("id", id));
    if (error) throw error;
    if (!count) return NextResponse.json({ error: "히스토리를 찾을 수 없습니다." }, { status: 404 });
    if (permanent) await supabase.from("trashed_histories").delete().eq("submission_id", row.submission_id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/histories/[id]] 삭제 실패", err);
    return NextResponse.json({ error: "삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
}
