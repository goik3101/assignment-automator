import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server-client";
import {
  getTaskSession,
  listStages,
  addStage,
  serializePriorStages,
  mergeEstablishedFacts,
  findFactMismatches,
} from "@/lib/sessions/task-sessions";
import { generateStage } from "@/lib/gemini/generate-stage";

// 다단계 세션의 다음 단계를 생성한다. "이전 단계 결과를 대화 맥락이 아니라 DB에서
// 다시 읽어와서 프롬프트에 명시적으로 주입"하는 게 이 라우트의 핵심 — listStages()가
// 매 호출마다 실제로 DB를 SELECT하고, 그 결과를 serializePriorStages()로 직렬화해서
// generateStage()의 프롬프트 맨 위에 넣는다. 콘솔 로그로 이 흐름이 실제로 도는지
// 확인할 수 있다 (generateStage 내부 로그 참고).
export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: RouteContext<"/api/sessions/[sessionId]/stages">) {
  try {
    const { sessionId } = await ctx.params;
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    // RLS(auth.uid() = user_id) 덕분에 다른 사람의 세션이면 null이 온다.
    const session = await getTaskSession(supabase, sessionId);
    if (!session) {
      return NextResponse.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
    }

    const { stageName, stageInstructions } = (await req.json()) as {
      stageName?: string;
      stageInstructions?: string;
    };
    if (!stageName) {
      return NextResponse.json({ error: "stageName이 필요합니다." }, { status: 400 });
    }

    // 매 호출마다 DB에서 이전 단계들을 다시 읽는다 — 프론트 상태나 대화 맥락에 의존하지 않는다.
    const priorStages = await listStages(supabase, sessionId);
    const priorStagesText = serializePriorStages(priorStages);
    const establishedFacts = mergeEstablishedFacts(priorStages);

    let result = await generateStage({
      subject: session.subject,
      coreTaskInfo: session.core_task_info,
      stageName,
      stageInstructions,
      priorStagesText,
    });

    // 사후 검증: 새로 확정된 사실이 이전 단계에서 이미 확정된 값과 어긋나면
    // (예: 2단계에서 정한 책 제목을 3단계가 다른 책으로 바꿔치기) 한 번 더 강하게
    // 지시해서 재시도하고, 그래도 어긋나면 조용히 넘어가지 않고 에러로 알린다.
    let mismatches = findFactMismatches(result.outputFacts, establishedFacts);
    if (mismatches.length > 0) {
      console.warn(
        `[stages] session=${sessionId} 사실 불일치 감지, 1회 재시도: ${JSON.stringify(mismatches)}`
      );
      const correction =
        `${stageInstructions ?? ""}\n\n【반드시 지킬 것 — 이전 시도가 다음 확정된 사실을 어겼다】\n` +
        mismatches.map((m) => `- ${m.key}는 반드시 "${m.expected}" 그대로 유지할 것 (임의로 "${m.got}"로 바꾸지 말 것)`).join("\n");

      result = await generateStage({
        subject: session.subject,
        coreTaskInfo: session.core_task_info,
        stageName,
        stageInstructions: correction,
        priorStagesText,
      });

      mismatches = findFactMismatches(result.outputFacts, establishedFacts);
      if (mismatches.length > 0) {
        console.error(`[stages] session=${sessionId} 재시도 후에도 불일치: ${JSON.stringify(mismatches)}`);
        return NextResponse.json(
          {
            error:
              `이전 단계에서 확정된 내용(${mismatches.map((m) => m.key).join(", ")})과 일치하지 않는 ` +
              `결과가 계속 생성돼서 저장하지 않았어요. 다시 시도해주세요.`,
          },
          { status: 422 }
        );
      }
    }

    const nextOrder = priorStages.length + 1;
    const saved = await addStage(supabase, {
      sessionId,
      stageOrder: nextOrder,
      stageName,
      outputText: result.outputText,
      outputFacts: result.outputFacts,
    });

    return NextResponse.json({ ...saved, sources: result.sources });
  } catch (err) {
    console.error("[/api/sessions/[sessionId]/stages] failed", err);
    return NextResponse.json({ error: "단계 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
