import { NextRequest, NextResponse } from "next/server";
import { requireLearningUser, jsonError } from "@/lib/learning/auth";
import { MAX_DRAFT_CHARS } from "@/types/learning";

// 학생 초안 자동 저장. AI 호출이 없으므로 횟수 제한과 무관하고, AI 요청이 실패했을 때도
// 이 경로로 초안은 항상 저장된다. 상태 전이는 서버가 결정한다:
//  - 피드백/완료 이후에 내용을 고치면 "revision"(수정 중)
//  - 그 외에 내용을 쓰면 "writing"
export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/learning/sections/[id]">) {
  try {
    const { id } = await ctx.params;
    const auth = await requireLearningUser(req);
    if ("error" in auth) return auth.error;
    const { supabase } = auth;

    const body = (await req.json()) as { draft?: string };
    if (typeof body.draft !== "string") return jsonError("저장할 내용이 없어요.", 400);
    if (body.draft.length > MAX_DRAFT_CHARS) {
      return jsonError(`한 항목은 ${MAX_DRAFT_CHARS.toLocaleString()}자까지 저장할 수 있어요.`, 413);
    }

    const { data: current, error } = await supabase
      .from("learning_sections")
      .select("id, session_id, status, draft")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!current) return jsonError("항목을 찾을 수 없어요.", 404);

    let status = current.status as string;
    if (body.draft !== current.draft) {
      if (["feedback", "revision", "completed"].includes(status)) status = "revision";
      else if (body.draft.trim()) status = "writing";
    }

    const now = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("learning_sections")
      .update({ draft: body.draft, status, updated_at: now })
      .eq("id", id);
    if (upErr) throw upErr;
    await supabase
      .from("learning_sessions")
      .update({ updated_at: now, status: "active" })
      .eq("id", current.session_id);

    return NextResponse.json({ ok: true, status, savedAt: now });
  } catch (err) {
    console.error("[/api/learning/sections/[id]] 저장 실패", err);
    return jsonError("저장하지 못했어요. 작성한 내용은 이 화면에 남아 있어요.", 500);
  }
}
