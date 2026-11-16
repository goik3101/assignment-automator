import { routeUsage } from "@/lib/llm/route-usage";
import { NextRequest } from "next/server";
import { analyzeAssignment, transcribeNotice } from "@/lib/gemini/analyze";
import { lookupAnalysis, storeAnalysis } from "@/lib/analysis-cache/cache";
import { validateAnalyzeInput } from "@/lib/api/validate";
import { finalReviewOn, leanWriteOn } from "@/lib/essay/quality-flags";
import { runStudyRoute, StudyInputError } from "@/lib/study/route";

// 사진이 여러 장이면 분석이 길어진다(같은 사진 1장 12.7초, 4장 20.9초 — 2026-11-04 실측). 다른 AI 경로처럼 실행 시간 상한을 명시해 플랫폼 기본값에 기대지 않는다.
export const maxDuration = 60;

// 이미지 분석이라 호출 비용이 큰 경로 — 로그인/게스트 확인과 하루 횟수 제한(+비로그인은 IP 상한)을 거친다.
// 본문 상한은 사진 최대 4장(validate.ts의 LIMITS.imageBase64 × 4)이 들어가던 기존 한도와 같게 둔다.
export const POST = routeUsage("analyze", async function POST(req: NextRequest) {
  return runStudyRoute(
    req,
    { kind: "analyze", allowGuest: true, maxBodyChars: 60_000_000, failureMessage: "안내문 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
    async ({ body }) => {
      const { imageBase64, imageMimeType, topicText, instructions, extraImages } = body as {
        imageBase64?: string;
        imageMimeType?: string;
        topicText?: string;
        instructions?: string;
        /** 안내문이 여러 장일 때 나머지 사진(최대 3장). */
        extraImages?: { base64: string; mimeType: string }[];
      };

      if (!imageBase64 && !topicText) {
        throw new StudyInputError("사진 또는 주제 텍스트 중 하나는 반드시 입력해야 합니다.");
      }
      const invalid = validateAnalyzeInput({ imageBase64, imageMimeType, topicText, instructions, extraImages });
      if (invalid) throw new StudyInputError(invalid);

      // 같은 안내문의 분석 재사용(ANALYSIS_CACHE=on, 마이그레이션 0021 적용 뒤). 사진만 있는 분석에만 쓴다 — 학생 지침·주제가 있으면 분석이 학생마다 달라진다.
      // 캐시 경로의 어떤 실패도 평소 분석으로 이어진다.
      let cacheSig: number[] | null = null;
      let knownTranscript: string | undefined;
      if (process.env.ANALYSIS_CACHE === "on" && imageBase64 && imageMimeType && !instructions?.trim() && !topicText?.trim()) {
        try {
          const images = [{ base64: imageBase64, mimeType: imageMimeType }, ...(extraImages ?? [])];
          knownTranscript = (await transcribeNotice(images)) ?? undefined;
          if (knownTranscript) {
            const { hit, sig } = await lookupAnalysis(knownTranscript);
            cacheSig = sig;
            if (hit) {
              console.log(`[analyze] 분석 캐시 적중(유사도 ${hit.similarity.toFixed(2)}) — 분석 호출 생략`);
              const cached = hit.analysis as { core_task_info?: Record<string, unknown> };
              const reused = { ...cached, core_task_info: { ...(cached.core_task_info ?? {}), notice_text: knownTranscript } } as unknown as Awaited<ReturnType<typeof analyzeAssignment>>;
              return { ...reused, wantsNoticeImages: (leanWriteOn() || finalReviewOn()) && !!imageBase64 };
            }
          }
        } catch (err) {
          console.warn("[analyze] 분석 캐시 조회 실패(평소 분석으로 진행)", err instanceof Error ? err.message : err);
        }
      }
      const analysis = await analyzeAssignment({ imageBase64, imageMimeType, extraImages, topicText, instructions, ...(knownTranscript ? { knownTranscript } : {}) });
      if (cacheSig) await storeAnalysis(cacheSig, analysis as unknown as Record<string, unknown>).catch((err) => console.warn("[analyze] 분석 캐시 저장 실패", err instanceof Error ? err.message : err));
      // 화면이 사진을 생성 요청에 실을지 알 수 있게 서버 스위치(ESSAY_LEAN_WRITE)를 알려 준다 — 꺼져 있으면 사진을 보낼 필요가 없다.
      return { ...analysis, wantsNoticeImages: (leanWriteOn() || finalReviewOn()) && !!imageBase64 };
    }
  );
});
