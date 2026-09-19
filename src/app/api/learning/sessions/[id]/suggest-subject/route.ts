import { NextRequest, NextResponse } from "next/server";
import { requireLearningUser, jsonError } from "@/lib/learning/auth";
import { suggestSubjectCandidates } from "@/lib/learning/suggest-subject";
import type { CoreTaskInfo } from "@/types/task";

export const maxDuration = 60;

// "AI 추천" — 다룰 인물/대상 후보 3개. 자료 조사·피드백 횟수에는 포함하지 않는다.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/learning/sessions/[id]/suggest-subject">) {
  try {
    const { id } = await ctx.params;
    const auth = await requireLearningUser(req);
    if ("error" in auth) return auth.error;
    const { supabase, user } = auth;

    const { data: session, error } = await supabase
      .from("learning_sessions")
      .select("subject, core_task_info, instructions")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!session) return jsonError("학습 과제를 찾을 수 없어요.", 404);

    const candidates = await suggestSubjectCandidates({
      subject: session.subject,
      info: session.core_task_info as CoreTaskInfo,
      instructions: session.instructions,
      userId: user.id,
    });
    if (candidates.length === 0) return jsonError("추천 후보를 만들지 못했어요. 직접 선택해주세요.", 502);
    return NextResponse.json({ candidates });
  } catch (err) {
    console.error("[/api/learning/suggest-subject] 실패", err);
    return jsonError("추천을 불러오지 못했어요. 직접 선택하거나 잠시 후 다시 시도해주세요.", 500);
  }
}
