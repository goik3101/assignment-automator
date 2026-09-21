import { routeUsage } from "@/lib/llm/route-usage";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { generateEssay } from "@/lib/gemini/generate-essay";
import { identifyCluster } from "@/lib/clusters/identify-cluster";
import { buildAvoidanceInstruction } from "@/lib/clusters/avoidance";
import { saveResultEmbedding, essayResultToText } from "@/lib/clusters/save-result-embedding";
import { buildRecommendationGuidance, recordRecommendation } from "@/lib/recommendations/recommendation-diversity";
import { normalizeBookTitleKey } from "@/lib/gemini/generate-essay";
import { canonicalize } from "@/lib/selection/canonical";
import { saveHistory } from "@/lib/histories/save-history";
import { resolveIdentity, GUEST_COOKIE_NAME } from "@/lib/auth/identity";
import { enforceGenerationLimit, recordGeneration, LimitExceededError } from "@/lib/usage/throttle";
import { verifyTurnstile } from "@/lib/turnstile/verify";
import { isAdminRequest } from "@/lib/admin/session";
import type { AdministrativeInfo, CoreTaskInfo } from "@/types/task";

// N1: 목표 3~4초대. 계획서(plan) 경로보다 짧을 것으로 예상하지만, 검색 그라운딩이
// 걸리는 만큼 여유 있게 60초로 잡아둔다 (Vercel Pro 기준 상한, 15번 챕터 참고).
export const maxDuration = 180;

export const POST = routeUsage("essay", async function POST(req: NextRequest) {
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
    // avoidanceInstruction(클러스터 결과물 전체의 의미적 쏠림)과는 다른 축 —
    // "똑같은 책 제목이 문자 그대로 반복되는지"를 본다(추천 다양성 시스템,
    // PROGRESS.md 참고). 실패해도(테이블 미생성 등) null을 반환할 뿐 여기를 막지 않는다.
    const bookGuidance = await buildRecommendationGuidance("book", { scopeKey: cluster.clusterId });
    // bookGuidance와 별개 축 — "책 제목"이 아니라 인권 선구자 같은 "자유 선정
    // 인물/사건"이 계정을 넘나들며 반복되는 버그(2026-09-16 실측 확인)를 막는다.
    const subjectGuidance = await buildRecommendationGuidance("subject", { scopeKey: cluster.clusterId });
    // 관리자 테스트 실행은 실제 추천 통계에서 빠지도록 표시한다(x-studed-test 헤더는 관리자 요청에서만 인정).
    const isTest = admin && req.headers.get("x-studed-test") === "1";

    const result = await generateEssay({
      subject,
      coreTaskInfo,
      instructions,
      avoidanceInstruction: avoidanceInstruction ?? undefined,
      recentBookGuidance: bookGuidance?.instructionText,
      recentSubjectGuidance: subjectGuidance?.instructionText,
      // 자동 선정: 같은 수행평가(cluster)·같은 사용자 기록으로 코드가 후보를 골라 본문 생성에 고정한다.
      selection: { userId: identity.userId, scopeKey: cluster.clusterId },
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

            if (result.recommendedBookTitle) {
              // 정규화된 값으로 저장 — 겹낫표/공백 차이로 같은 책이 다른 항목처럼
              // 카운트되는 걸 막기 위함(표시용이 아니라 빈도 집계용 테이블이라 우선함).
              // await하는 이유: Vercel 서버리스 함수는 응답을 보내고 나면 남은
              // 비동기 작업을 계속 보장하지 않는다 — 이 함수 내 다른 부수 기록
              // (saveResultEmbedding/recordGeneration/saveHistory)도 전부 await함.
              await recordRecommendation({
                category: "book",
                itemName: normalizeBookTitleKey(result.recommendedBookTitle),
                userId: identity.userId,
                guestId: identity.guestId,
                clusterId: cluster.clusterId,
                topic: coreTaskInfo.topic,
                submissionId,
                isTest,
              });
            }

            if (result.confirmedSubject || result.selection) {
              // recommendedBookTitle과 별개로도 기록한다 — 책 처방형 과제는
              // confirmedSubject에도 같은 책 제목이 들어올 수 있어 두 카테고리에
              // 중복 기록될 수 있지만, 서로 다른 안내 문구로 쓰이므로 무해하다.
              await recordRecommendation({
                category: "subject",
                // 자동 선정이 고른 대상이면 그 canonical key/표시 이름/계열을, 아니면(학생 지정·선정 아님·불일치) 실제로 다룬 대상을 canonical로 변환해 기록한다.
                ...(() => {
                  const auto = result.selection && !result.selection.violated ? result.selection : null;
                  const c = auto ? { key: auto.key, display: auto.name } : canonicalize(result.confirmedSubject ?? "");
                  return { itemName: c.key, displayName: c.display, semanticGroup: auto?.group ?? null };
                })(),
                userId: identity.userId,
                guestId: identity.guestId,
                clusterId: cluster.clusterId,
                topic: coreTaskInfo.topic,
                submissionId,
                isTest,
              });
            }

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
});
