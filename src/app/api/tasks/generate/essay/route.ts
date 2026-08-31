import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { generateEssay } from "@/lib/gemini/generate-essay";
import { identifyCluster } from "@/lib/clusters/identify-cluster";
import { buildAvoidanceInstruction } from "@/lib/clusters/avoidance";
import { saveResultEmbedding, essayResultToText } from "@/lib/clusters/save-result-embedding";
import { saveHistory } from "@/lib/histories/save-history";
import { resolveIdentity, GUEST_COOKIE_NAME } from "@/lib/auth/identity";
import { enforceGenerationLimit, recordGeneration, LimitExceededError } from "@/lib/usage/throttle";
import { verifyTurnstile } from "@/lib/turnstile/verify";
import { isAdminRequest } from "@/lib/admin/session";
import type { AdministrativeInfo, CoreTaskInfo } from "@/types/task";

// N1: 목표 3~4초대. 계획서(plan) 경로보다 짧을 것으로 예상하지만, 검색 그라운딩이
// 걸리는 만큼 여유 있게 60초로 잡아둔다 (Vercel Pro 기준 상한, 15번 챕터 참고).
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject, coreTaskInfo, adminInfo, instructions, turnstileToken } = body as {
      subject: string;
      coreTaskInfo: CoreTaskInfo;
      adminInfo?: AdministrativeInfo;
      instructions?: string;
      turnstileToken?: string;
    };

    if (!subject || !coreTaskInfo) {
      return NextResponse.json({ error: "subject와 coreTaskInfo가 필요합니다." }, { status: 400 });
    }

    const { identity, supabase } = await resolveIdentity(req);
    const admin = isAdminRequest(req); // 11-6: 관리자는 모든 제한에서 예외

    // N4: 비로그인 요청은 캡차를 통과해야 한다.
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

    const result = await generateEssay({
      subject,
      coreTaskInfo,
      instructions,
      avoidanceInstruction: avoidanceInstruction ?? undefined,
    });

    const response =
      result.type === "essay"
        ? await (async () => {
            const submissionId = randomUUID();
            await saveResultEmbedding({
              clusterId: cluster.clusterId,
              submissionId,
              resultText: essayResultToText(result),
            });
            await recordGeneration(identity, "generate", !!avoidanceInstruction);

            if (identity.userId) {
              const textElements = coreTaskInfo.task_elements.filter((e) => e.type === "text_submission");
              await saveHistory(supabase, {
                userId: identity.userId,
                clusterId: cluster.clusterId,
                submissionId,
                outputType: "essay",
                // markdown뿐 아니라 sources/latency_ms까지 통째로 저장해서, 히스토리
                // 상세 화면(M5)에서 결과 화면과 완전히 동일하게(출처 링크 포함) 다시
                // 보여줄 수 있게 한다 — plan 쪽과 저장 방식을 통일.
                rawTextResult: JSON.stringify(result),
                subject,
                // 완성 원고 요소가 여러 개(다단계 과제)면 요소 하나의 이름 대신
                // 과제 전체 주제를 제목으로 쓴다 — 히스토리 목록에서 더 알아보기 쉽다.
                title: textElements.length > 1 ? coreTaskInfo.topic : (textElements[0]?.label ?? coreTaskInfo.topic),
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
    console.error("[/api/tasks/generate/essay] failed", err);
    return NextResponse.json(
      { error: "원고 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 }
    );
  }
}
