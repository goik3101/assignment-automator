import { NextRequest, NextResponse } from "next/server";
import { requireLearningUser, jsonError } from "@/lib/learning/auth";
import { researchLearningItems } from "@/lib/learning/research";
import {
  enforceLearningLimit,
  getLearningUsage,
  recordLearningUsage,
  LearningLimitError,
} from "@/lib/learning/usage";
import type { CoreTaskInfo } from "@/types/task";

export const maxDuration = 60;

// 과제 전체의 자료 조사(항목별로 나눠서 저장). 이미 조사가 끝난 과제는 다시 호출해도
// 횟수를 쓰지 않고 저장된 결과를 그대로 돌려준다. 실패해도 학생이 쓴 초안은 건드리지 않는다.
export async function POST(req: NextRequest, ctx: RouteContext<"/api/learning/sessions/[id]/research">) {
  const { id } = await ctx.params;
  const auth = await requireLearningUser(req);
  if ("error" in auth) return auth.error;
  const { supabase, user, isAdmin } = auth;

  try {
    const { data: session, error } = await supabase
      .from("learning_sessions")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!session) return jsonError("학습 과제를 찾을 수 없어요.", 404);

    if (session.research_status === "done") {
      return NextResponse.json({ ok: true, alreadyDone: true, usage: await getLearningUsage(user.id, isAdmin) });
    }
    const fresh = Date.now() - new Date(session.updated_at).getTime() < 2 * 60 * 1000;
    if (session.research_status === "running" && fresh) {
      return jsonError("자료를 조사하고 있어요. 잠시만 기다려주세요.", 409);
    }

    await enforceLearningLimit(user.id, isAdmin);

    const { data: sections, error: sErr } = await supabase
      .from("learning_sections")
      .select("id, label, status")
      .eq("session_id", id)
      .order("position", { ascending: true });
    if (sErr) throw sErr;
    const rows = sections ?? [];

    await supabase
      .from("learning_sessions")
      .update({ research_status: "running", updated_at: new Date().toISOString() })
      .eq("id", id);
    await supabase.from("learning_sections").update({ status: "researching" }).eq("session_id", id).eq("status", "not_started");

    const info = session.core_task_info as CoreTaskInfo;
    let result;
    try {
      result = await researchLearningItems({
        subject: session.subject,
        topic: info.topic,
        requirements: info.requirements,
        labels: rows.map((r) => r.label),
        focusSubject: session.focus_subject,
        instructions: session.instructions,
      });
    } catch (err) {
      console.error("[/api/learning/research] 조사 실패", err);
      await supabase.from("learning_sessions").update({ research_status: "failed" }).eq("id", id);
      // 조사에 실패해도 학생이 바로 쓸 수 있게 상태를 되돌린다(초안·기존 내용은 그대로).
      await supabase.from("learning_sections").update({ status: "not_started" }).eq("session_id", id).eq("status", "researching");
      return jsonError("자료를 조사하지 못했어요. 횟수는 차감되지 않았어요. 잠시 후 다시 시도해주세요.", 502);
    }

    for (const row of rows) {
      const research = result.get(row.label) ?? null;
      const patch: Record<string, unknown> = { research, updated_at: new Date().toISOString() };
      if (row.status === "not_started" || row.status === "researching") patch.status = "writing";
      await supabase.from("learning_sections").update(patch).eq("id", row.id);
    }
    await supabase
      .from("learning_sessions")
      .update({ research_status: "done", updated_at: new Date().toISOString() })
      .eq("id", id);
    await recordLearningUsage(user.id, "research");

    return NextResponse.json({ ok: true, usage: await getLearningUsage(user.id, isAdmin) });
  } catch (err) {
    if (err instanceof LearningLimitError) return jsonError(err.message, 429);
    console.error("[/api/learning/research] 실패", err);
    return jsonError("자료 조사 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.", 500);
  }
}
