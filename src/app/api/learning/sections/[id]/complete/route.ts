import { isUuid } from "@/lib/api/validate";
import { NextRequest, NextResponse } from "next/server";
import { requireLearningUser, jsonError } from "@/lib/learning/auth";

// 항목 완료 처리. AI 판단(readyToComplete)은 참고일 뿐 최종 결정은 학생이 하므로 서버는
// "초안이 비어 있지 않은지"만 확인한다. 모든 항목이 완료되면 과제 전체도 완료로 바꾼다.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/learning/sections/[id]/complete">) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return jsonError("찾을 수 없어요.", 404);
    const auth = await requireLearningUser(req);
    if ("error" in auth) return auth.error;
    const { supabase } = auth;

    const { data: section, error } = await supabase
      .from("learning_sections")
      .select("id, session_id, draft")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!section) return jsonError("항목을 찾을 수 없어요.", 404);
    if (!section.draft.trim()) return jsonError("내용을 작성한 뒤에 완료할 수 있어요.", 400);

    const now = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("learning_sections")
      .update({ status: "completed", updated_at: now })
      .eq("id", id);
    if (upErr) throw upErr;

    const { data: all, error: allErr } = await supabase
      .from("learning_sections")
      .select("status")
      .eq("session_id", section.session_id);
    if (allErr) throw allErr;
    const sessionCompleted = (all ?? []).length > 0 && (all ?? []).every((s) => s.status === "completed");
    await supabase
      .from("learning_sessions")
      .update({ status: sessionCompleted ? "completed" : "active", updated_at: now })
      .eq("id", section.session_id);

    return NextResponse.json({ ok: true, sessionCompleted });
  } catch (err) {
    console.error("[/api/learning/sections/[id]/complete] 실패", err);
    return jsonError("완료 처리하지 못했어요.", 500);
  }
}
