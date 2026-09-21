import { isUuid } from "@/lib/api/validate";
import { NextRequest, NextResponse } from "next/server";
import { requireLearningUser, jsonError } from "@/lib/learning/auth";

// 휴지통에서 학습 과제 복원 (deleted_at 해제).
export async function POST(req: NextRequest, ctx: RouteContext<"/api/learning/sessions/[id]/restore">) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return jsonError("찾을 수 없어요.", 404);
    const auth = await requireLearningUser(req);
    if ("error" in auth) return auth.error;
    const { supabase } = auth;

    const { error, count } = await supabase
      .from("learning_sessions")
      .update({ deleted_at: null, updated_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", id)
      .not("deleted_at", "is", null);
    if (error) throw error;
    if (!count) return jsonError("휴지통에서 찾을 수 없어요.", 404);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/learning/sessions/[id]/restore] 실패", err);
    return jsonError("복원하지 못했어요.", 500);
  }
}
