import { routeUsage } from "@/lib/llm/route-usage";
import { withSourceScope } from "@/lib/llm/scope";
import { withUiLangRoute } from "@/lib/llm/ui-lang-route";
import { parseSourceScope } from "@/lib/essay/source-scope";
import { NextRequest, NextResponse } from "next/server";
import { validateGenerationFields } from "@/lib/api/validate";
import { generateEssay } from "@/lib/gemini/generate-essay";
import { generatePlan } from "@/lib/gemini/generate-plan";
import { buildAvoidanceInstruction } from "@/lib/clusters/avoidance";
import { saveResultEmbedding, essayResultToText, planResultToText } from "@/lib/clusters/save-result-embedding";
import { getCurrentHistoryBySubmission, saveHistory } from "@/lib/histories/save-history";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { enforceRegenerationLimit, recordGeneration, LimitExceededError, releaseGeneration } from "@/lib/usage/throttle";
import { isLimitExempt } from "@/lib/admin/session";
import type { EssayResult, InsufficientDataResult, PlanResult } from "@/types/task";

// F6/9-5: 재생성. 로그인 사용자만, 하루 1회. 이전 결과(user_histories, submissionId로
// 조회)에서 subject/coreTaskInfo/instructions/clusterId를 그대로 가져오므로,
// 클라이언트는 submissionId와 수정 방향(revisionInstructions)만 보내면 된다.
export const maxDuration = 180;

export const POST = routeUsage("regenerate", withUiLangRoute(async function POST(req: NextRequest, ctx: RouteContext<"/api/tasks/[submissionId]/regenerate">) {
  // 사용 횟수는 생성 전에 자리를 잡고(동시 요청 구멍 방지), 결과를 못 만들면 돌려준다 — throttle.ts.
  let reservation: string | null = null;
  try {
    const { submissionId } = await ctx.params;
    const { revisionInstructions, sourceScope } = (await req.json()) as { revisionInstructions?: string; sourceScope?: unknown };
    const invalidFields = validateGenerationFields({ revisionInstructions });
    if (invalidFields) return NextResponse.json({ error: invalidFields }, { status: 400 });

    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const admin = isLimitExempt(req, user.email); // 11-6: 관리자는 모든 제한에서 예외

    try {
      reservation = await enforceRegenerationLimit(user.id, admin);
    } catch (err) {
      if (err instanceof LimitExceededError) {
        return NextResponse.json({ error: err.message }, { status: 429 });
      }
      throw err;
    }

    // RLS(auth.uid() = user_id) 덕분에 다른 사람의 submissionId를 넣어도 조회되지 않는다.
    const history = await getCurrentHistoryBySubmission(supabase, submissionId);
    if (!history || history.user_id !== user.id) {
      return NextResponse.json({ error: "이전 결과를 찾을 수 없습니다." }, { status: 404 });
    }

    // 재생성 직전 비교에서는 자기 자신(이 submissionId)의 기존 임베딩을 비교 대상에서
    // 제외한다 (기획서 6-2) — 안 그러면 "나 자신과 비슷하다"는 이유로 항상 억제가 걸린다.
    const avoidanceInstruction = await buildAvoidanceInstruction(history.cluster_id, submissionId);

    // 이전 버전의 실제 결과 텍스트를 프롬프트에 다시 넣어준다 — 안 그러면 재생성마다
    // 인물 이름·에피소드·처방한 책 같은 구체적 내용이 매번 새로 지어져서 하나로
    // 이어지지 않는다 (버그 리포트로 확인된 문제).
    let previousOutputText: string | undefined;
    try {
      const previousResult = JSON.parse(history.raw_text_result) as EssayResult | PlanResult;
      previousOutputText =
        previousResult.type === "essay" ? essayResultToText(previousResult) : planResultToText(previousResult);
    } catch (err) {
      console.error("[regenerate] 이전 버전 파싱 실패 — 연속성 없이 진행", err);
    }

    const generateArgs = {
      subject: history.subject,
      coreTaskInfo: history.core_task_info,
      instructions: history.instructions ?? undefined,
      avoidanceInstruction: avoidanceInstruction ?? undefined,
      revisionInstructions,
      previousOutputText,
    };

    const result = await withSourceScope<EssayResult | PlanResult | InsufficientDataResult>(parseSourceScope(sourceScope), () =>
      history.output_type === "essay" ? generateEssay(generateArgs) : generatePlan(generateArgs)
    );

    if (result.type === "insufficient_data") {
      await releaseGeneration(reservation);
      return NextResponse.json(result);
    }

    await saveResultEmbedding({
      clusterId: history.cluster_id,
      submissionId,
      resultText: result.type === "essay" ? essayResultToText(result) : planResultToText(result),
      isRegeneration: true,
    });
    await recordGeneration(
      { userId: user.id, guestId: null, isNewGuest: false },
      "regenerate",
      !!avoidanceInstruction,
      reservation
    );
    await saveHistory(supabase, {
      userId: user.id,
      clusterId: history.cluster_id,
      submissionId,
      outputType: history.output_type,
      rawTextResult: JSON.stringify(result),
      subject: history.subject,
      title: history.title,
      coreTaskInfo: history.core_task_info,
      adminInfo: history.admin_info,
      instructions: history.instructions ?? undefined,
      isRegeneration: true,
    });

    return NextResponse.json({ ...result, clusterId: history.cluster_id, submissionId });
  } catch (err) {
    await releaseGeneration(reservation);
    console.error("[/api/tasks/[submissionId]/regenerate] failed", err);
    return NextResponse.json(
      { error: "재생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 }
    );
  }
}));
