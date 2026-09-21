import { isUuid } from "@/lib/api/validate";
import { routeUsage } from "@/lib/llm/route-usage";
import { NextRequest, NextResponse } from "next/server";
import { requireLearningUser, jsonError } from "@/lib/learning/auth";
import { suggestSubjectCandidates } from "@/lib/learning/suggest-subject";
import { lookupClusterReadOnly } from "@/lib/selection/scope";
import { SUBJECT_TYPE_LABEL } from "@/lib/learning/subject-spec";
import type { CoreTaskInfo } from "@/types/task";

export const maxDuration = 180;

// "AI 추천" — 다룰 인물/대상 후보 3개. 자료 조사·피드백 횟수에는 포함하지 않는다.
export const POST = routeUsage("learningSuggest", async function POST(req: NextRequest, ctx: RouteContext<"/api/learning/sessions/[id]/suggest-subject">) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return jsonError("찾을 수 없어요.", 404);
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

    // 같은 수행평가(cluster)를 쓰기 없이 조회해 그 범위의 최근 선정 이력으로 후보를 고른다(못 찾으면 이력 미사용).
    const scopeKey = await lookupClusterReadOnly(session.core_task_info as CoreTaskInfo);
    const result = await suggestSubjectCandidates({
      scopeKey,
      subject: session.subject,
      info: session.core_task_info as CoreTaskInfo,
      instructions: session.instructions,
      userId: user.id,
    });
    const { spec, candidates, needsClarification } = result;
    const target = { typeLabel: SUBJECT_TYPE_LABEL[spec.subject_type], constraints: spec.constraints };
    if (needsClarification) {
      // 안내문에서 대상 종류를 알 수 없으면 임의로 단정해 추천하지 않고, 확인된/확인되지 않은 점을 알려준다.
      return NextResponse.json({ candidates: [], needsClarification: true, message: spec.clarification_note, target });
    }
    if (candidates.length === 0) {
      return jsonError("과제 조건(" + target.typeLabel + (spec.constraints.length ? " · " + spec.constraints.join(", ") : "") + ")에 맞는 후보를 확인하지 못했어요. 직접 선택해주세요.", 502);
    }
    return NextResponse.json({ candidates, target });
  } catch (err) {
    console.error("[/api/learning/suggest-subject] 실패", err);
    return jsonError("추천을 불러오지 못했어요. 직접 선택하거나 잠시 후 다시 시도해주세요.", 500);
  }
});
