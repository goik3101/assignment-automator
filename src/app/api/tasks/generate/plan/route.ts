import { validateCoreTaskInfo } from "@/lib/api/validate";
import { routeUsage } from "@/lib/llm/route-usage";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { generatePlan } from "@/lib/gemini/generate-plan";
import { identifyCluster } from "@/lib/clusters/identify-cluster";
import { buildAvoidanceInstruction } from "@/lib/clusters/avoidance";
import { saveResultEmbedding, planResultToText } from "@/lib/clusters/save-result-embedding";
import { buildRecommendationGuidance, recordRecommendation } from "@/lib/recommendations/recommendation-diversity";
import { saveHistory } from "@/lib/histories/save-history";
import { resolveIdentity, GUEST_COOKIE_NAME } from "@/lib/auth/identity";
import { enforceGenerationLimit, recordGeneration, LimitExceededError } from "@/lib/usage/throttle";
import { verifyTurnstile } from "@/lib/turnstile/verify";
import { isLimitExempt } from "@/lib/admin/session";
import type { AdministrativeInfo, CoreTaskInfo } from "@/types/task";

// N2: 1차 검색+2차 JSON변환의 2단계 구조라 8~12초 걸릴 가능성이 있다고 예상됨.
// M1에서 이 경로의 latency_ms를 실측해서, Vercel Hobby(10초 컷)로 충분한지
// Pro(60초)가 필요한지 판단한다. (기획서 15, 18, 19번 챕터 참고)
export const maxDuration = 180;

export const POST = routeUsage("plan", async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "요청 본문이 올바른 JSON이 아닙니다." }, { status: 400 });
    }
    const { subject, coreTaskInfo, adminInfo, instructions, turnstileToken, fixedSubject, referenceFactsText } =
      body as {
        subject: string;
        coreTaskInfo: CoreTaskInfo;
        adminInfo?: AdministrativeInfo;
        instructions?: string;
        turnstileToken?: string;
        /** 같은 과제의 완성 원고(text_submission)가 먼저 생성되어 인물/사건 등을
         * 확정했다면 그 값(EssayResult.confirmedSubject) — 인물 혼입 방지용. */
        fixedSubject?: string;
        /** 위와 같은 완성 원고의 전체 텍스트 — 날짜/숫자 등 세부 사실 일관성
         * 방지용(EssayResult.markdown). */
        referenceFactsText?: string;
      };

    if (!subject || !coreTaskInfo) {
      return NextResponse.json({ error: "subject와 coreTaskInfo가 필요합니다." }, { status: 400 });
    }
    const invalidInfo = validateCoreTaskInfo(coreTaskInfo, instructions);
    if (invalidInfo) return NextResponse.json({ error: invalidInfo }, { status: 400 });

    const { identity, supabase } = await resolveIdentity(req);
    const admin = isLimitExempt(req, identity.email); // 11-6: 관리자는 모든 제한에서 예외

    if (!admin && !identity.userId && !(await verifyTurnstile(turnstileToken ?? null))) {
      return NextResponse.json({ error: "캡차 확인에 실패했습니다. 다시 시도해주세요." }, { status: 403 });
    }

    try {
      await enforceGenerationLimit(identity, admin);
    } catch (err) {
      if (err instanceof LimitExceededError) {
        return NextResponse.json({ error: err.message }, { status: 429 });
      }
      throw err;
    }

    // 기획서 5-0 핵심 순서: 클러스터 식별 + 회피 지시 계산(2단계)이 반드시
    // 생성(3단계)보다 먼저 일어나야 그 결과를 프롬프트에 반영할 수 있다.
    const cluster = await identifyCluster(coreTaskInfo);
    const avoidanceInstruction = await buildAvoidanceInstruction(cluster.clusterId);
    // generate-essay.ts의 recentBookGuidance와 같은 역할, 카테고리만 다름 —
    // 새 회피 로직을 따로 안 만들고 recommendation-diversity.ts를 재사용.
    const statGuidance = await buildRecommendationGuidance("statistic", { scopeKey: cluster.clusterId });

    const result = await generatePlan({
      subject,
      coreTaskInfo,
      instructions,
      avoidanceInstruction: avoidanceInstruction ?? undefined,
      recentStatGuidance: statGuidance?.instructionText,
      fixedSubject,
      referenceFactsText,
    });

    const response =
      result.type === "plan"
        ? await (async () => {
            const submissionId = randomUUID();
            await saveResultEmbedding({
              clusterId: cluster.clusterId,
              submissionId,
              resultText: planResultToText(result),
            });
            await recordGeneration(identity, "generate", !!avoidanceInstruction);

            for (const itemName of result.verifiedItemNames ?? []) {
              await recordRecommendation({
                category: "statistic",
                itemName,
                userId: identity.userId,
                guestId: identity.guestId,
                clusterId: cluster.clusterId,
                topic: coreTaskInfo.topic,
                submissionId,
              });
            }

            if (identity.userId) {
              const element = coreTaskInfo.task_elements.find(
                (e) => e.type === "external_production"
              );
              await saveHistory(supabase, {
                userId: identity.userId,
                clusterId: cluster.clusterId,
                submissionId,
                outputType: "plan",
                rawTextResult: JSON.stringify(result),
                subject,
                title: element?.label ?? coreTaskInfo.topic,
                coreTaskInfo,
                adminInfo: adminInfo ?? null,
                instructions,
              });
            }

            return NextResponse.json({ ...result, clusterId: cluster.clusterId, submissionId });
          })()
        : NextResponse.json(result);

    if (identity.isNewGuest && identity.guestId) {
      response.cookies.set(GUEST_COOKIE_NAME, identity.guestId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      });
    }

    return response;
  } catch (err) {
    console.error("[/api/tasks/generate/plan] failed", err);
    return NextResponse.json(
      { error: "실행계획 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 }
    );
  }
});
