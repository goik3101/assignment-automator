import { routeUsage } from "@/lib/llm/route-usage";
import { NextRequest, NextResponse } from "next/server";
import { requireLearningUser, jsonError } from "@/lib/learning/auth";
import { generateLearningFeedback } from "@/lib/learning/feedback";
import {
  enforceLearningLimit,
  getLearningUsage,
  recordLearningUsage,
  LearningLimitError,
} from "@/lib/learning/usage";
import type { LearningFeedback, SectionResearch } from "@/types/learning";
import type { CoreTaskInfo } from "@/types/task";

export const maxDuration = 60;

const MIN_DRAFT_CHARS = 10;
const MAX_HISTORY = 10;

// 학생 답변에 대한 피드백(1회 사용). 성공했을 때만 횟수를 차감하고, 실패해도 초안은 그대로다.
export const POST = routeUsage("learningFeedback", async function POST(req: NextRequest, ctx: RouteContext<"/api/learning/sections/[id]/feedback">) {
  const { id } = await ctx.params;
  const auth = await requireLearningUser(req);
  if ("error" in auth) return auth.error;
  const { supabase, user, isAdmin } = auth;

  try {
    const body = (await req.json().catch(() => ({}))) as { question?: string };
    const question = body.question?.trim().slice(0, 300) || undefined;

    const { data: section, error } = await supabase
      .from("learning_sections")
      .select("id, session_id, label, research, draft, feedback, feedback_history, status")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!section) return jsonError("항목을 찾을 수 없어요.", 404);

    if (section.draft.trim().length < MIN_DRAFT_CHARS) {
      return jsonError(`피드백을 받으려면 먼저 ${MIN_DRAFT_CHARS}자 이상 직접 작성해주세요.`, 400);
    }

    const { data: session, error: sErr } = await supabase
      .from("learning_sessions")
      .select("subject, core_task_info, focus_subject")
      .eq("id", section.session_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!session) return jsonError("학습 과제를 찾을 수 없어요.", 404);

    await enforceLearningLimit(user.id, isAdmin);

    const info = session.core_task_info as CoreTaskInfo;
    const research = section.research as SectionResearch | null;
    const previous = section.feedback as LearningFeedback | null;

    let feedback: LearningFeedback;
    try {
      feedback = await generateLearningFeedback({
        subject: session.subject,
        topic: info.topic,
        requirements: info.requirements,
        sectionLabel: section.label,
        focusSubject: session.focus_subject,
        researchContent: research?.content ?? "",
        draft: section.draft,
        previousSummary: previous?.summary,
        question,
      });
    } catch (err) {
      console.error("[/api/learning/feedback] 생성 실패", err);
      return jsonError("피드백을 만들지 못했어요. 횟수는 차감되지 않았고, 작성한 내용은 그대로예요.", 502);
    }

    const history = [...((section.feedback_history as LearningFeedback[] | null) ?? []), feedback].slice(-MAX_HISTORY);
    const now = new Date().toISOString();
    const { error: upErr } = await supabase
      .from("learning_sections")
      .update({
        feedback,
        feedback_history: history,
        revision_count: Math.max(0, history.length - 1),
        status: section.status === "completed" ? "completed" : "feedback",
        updated_at: now,
      })
      .eq("id", id);
    if (upErr) throw upErr;
    await supabase.from("learning_sessions").update({ updated_at: now }).eq("id", section.session_id);
    await recordLearningUsage(user.id, "feedback");

    return NextResponse.json({ feedback, usage: await getLearningUsage(user.id, isAdmin) });
  } catch (err) {
    if (err instanceof LearningLimitError) return jsonError(err.message, 429);
    console.error("[/api/learning/feedback] 실패", err);
    return jsonError("피드백 중 오류가 발생했어요. 작성한 내용은 그대로예요.", 500);
  }
});
