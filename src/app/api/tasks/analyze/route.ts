import { NextRequest, NextResponse } from "next/server";
import { analyzeAssignment } from "@/lib/gemini/analyze";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64, imageMimeType, topicText, instructions } = body as {
      imageBase64?: string;
      imageMimeType?: string;
      topicText?: string;
      instructions?: string;
    };

    if (!imageBase64 && !topicText) {
      return NextResponse.json(
        { error: "사진 또는 주제 텍스트 중 하나는 반드시 입력해야 합니다." },
        { status: 400 }
      );
    }

    const result = await analyzeAssignment({
      imageBase64,
      imageMimeType,
      topicText,
      instructions,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/tasks/analyze] failed", err);
    return NextResponse.json(
      { error: "안내문 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 }
    );
  }
}
