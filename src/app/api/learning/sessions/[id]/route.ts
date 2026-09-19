import { NextRequest, NextResponse } from "next/server";
import { requireLearningUser, jsonError } from "@/lib/learning/auth";
import { getLearningUsage } from "@/lib/learning/usage";
import { needsSubjectSelection } from "@/lib/learning/items";
import type { CoreTaskInfo } from "@/types/task";

// 학습 과제 한 건 + 항목들 + 오늘 남은 AI 횟수 (새로고침/재접속 시 복구용).
export async function GET(req: NextRequest, ctx: RouteContext<"/api/learning/sessions/[id]">) {
  try {
    const { id } = await ctx.params;
    const auth = await requireLearningUser(req);
    if ("error" in auth) return auth.error;
    const { supabase, user, isAdmin } = auth;

    const { data: session, error } = await supabase
      .from("learning_sessions")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!session) return jsonError("학습 과제를 찾을 수 없어요.", 404);

    const { data: sections, error: sErr } = await supabase
      .from("learning_sections")
      .select(
        "id, session_id, position, label, element_label, research, draft, feedback, feedback_history, revision_count, status, updated_at"
      )
      .eq("session_id", id)
      .order("position", { ascending: true });
    if (sErr) throw sErr;

    const usage = await getLearningUsage(user.id, isAdmin);
    return NextResponse.json({
      session,
      sections: sections ?? [],
      usage,
      needsSubjectSelection: needsSubjectSelection(session.core_task_info as CoreTaskInfo),
    });
  } catch (err) {
    console.error("[/api/learning/sessions/[id]] 조회 실패", err);
    return jsonError("학습 과제를 불러오지 못했어요.", 500);
  }
}

// 다룰 인물/대상 저장 (직접 입력 또는 AI 추천 후보 선택).
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/learning/sessions/[id]">) {
  try {
    const { id } = await ctx.params;
    const auth = await requireLearningUser(req);
    if ("error" in auth) return auth.error;
    const { supabase } = auth;

    const body = (await req.json()) as { focusSubject?: string | null; subjectMode?: "direct" | "ai" | "none" };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.focusSubject !== undefined) {
      const v = body.focusSubject?.trim() ?? "";
      if (v.length > 80) return jsonError("이름이 너무 길어요.", 400);
      patch.focus_subject = v || null;
    }
    if (body.subjectMode) patch.subject_mode = body.subjectMode;

    const { error, count } = await supabase
      .from("learning_sessions")
      .update(patch, { count: "exact" })
      .eq("id", id)
      .is("deleted_at", null);
    if (error) throw error;
    if (!count) return jsonError("학습 과제를 찾을 수 없어요.", 404);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/learning/sessions/[id]] 수정 실패", err);
    return jsonError("저장하지 못했어요.", 500);
  }
}

// 기본은 소프트 삭제(휴지통으로 이동, 데이터는 남김). ?permanent=1이면 영구 삭제(항목도 함께 삭제).
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/learning/sessions/[id]">) {
  try {
    const { id } = await ctx.params;
    const auth = await requireLearningUser(req);
    if ("error" in auth) return auth.error;
    const { supabase } = auth;

    if (req.nextUrl.searchParams.get("permanent") === "1") {
      const { error, count } = await supabase
        .from("learning_sessions")
        .delete({ count: "exact" })
        .eq("id", id);
      if (error) throw error;
      if (!count) return jsonError("학습 과제를 찾을 수 없어요.", 404);
      return NextResponse.json({ ok: true });
    }

    const { error, count } = await supabase
      .from("learning_sessions")
      .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", id)
      .is("deleted_at", null);
    if (error) throw error;
    if (!count) return jsonError("학습 과제를 찾을 수 없어요.", 404);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/learning/sessions/[id]] 삭제 실패", err);
    return jsonError("삭제하지 못했어요.", 500);
  }
}
