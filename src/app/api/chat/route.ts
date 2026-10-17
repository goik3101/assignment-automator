import { NextRequest } from "next/server";
import { routeUsage } from "@/lib/llm/route-usage";
import { runStudyRoute, StudyInputError } from "@/lib/study/route";
import { answerChat, sanitizeTurns } from "@/lib/study/chat";

export const maxDuration = 120;

const MAX_IMAGE_BASE64 = 5_500_000; // 약 4MB 이미지
const ALLOWED_IMAGE = /^image\/(png|jpe?g|webp|gif)$/;

// 홈의 입력창과 각 과제 화면의 "AI 채팅"이 함께 쓰는 질문 답변. 새 안내문(사진·글)을 붙여 물어보거나, 기존 과제를 골라 물어본다.
// 과제 내용(context)은 id만 받아 서버가 본인 것만 읽어온다. 로그인 사용자만, 종류별 하루 횟수 제한(study/usage.ts).
export const POST = routeUsage("studyChat", async function POST(req: NextRequest) {
  return runStudyRoute(req, { kind: "chat", maxBodyChars: 8_000_000 }, async ({ body, context, lang }) => {
    const turns = sanitizeTurns(body.messages);
    if (turns.length === 0) throw new StudyInputError("질문을 입력해 주세요.");

    let image: { base64: string; mimeType: string } | null = null;
    const img = body.image as { base64?: unknown; mimeType?: unknown } | undefined;
    if (img && typeof img.base64 === "string" && typeof img.mimeType === "string") {
      if (!ALLOWED_IMAGE.test(img.mimeType)) throw new StudyInputError("이미지 파일(JPG, PNG, WEBP)만 올릴 수 있어요.");
      if (img.base64.length > MAX_IMAGE_BASE64) throw new StudyInputError("이미지가 너무 커요. 더 작은 사진으로 올려 주세요.");
      image = { base64: img.base64, mimeType: img.mimeType };
    }

    return answerChat({ turns, image, context, lang });
  });
});
