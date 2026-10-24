import { routeUsage } from "@/lib/llm/route-usage";
import { NextRequest } from "next/server";
import { analyzeAssignment } from "@/lib/gemini/analyze";
import { validateAnalyzeInput } from "@/lib/api/validate";
import { runStudyRoute, StudyInputError } from "@/lib/study/route";

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

      return analyzeAssignment({ imageBase64, imageMimeType, extraImages, topicText, instructions });
    }
  );
});
