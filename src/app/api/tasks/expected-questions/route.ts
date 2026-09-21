import { routeUsage } from "@/lib/llm/route-usage";
import { NextRequest, NextResponse } from "next/server";
import { generateExpectedQuestions } from "@/lib/gemini/expected-questions";

// 9-3: 예상 질문 생성. 이미 만든 결과물을 바탕으로 뽑는 가벼운 보조 기능이라
// 로그인/횟수 제한 없이 제공한다.
export const POST = routeUsage("expectedQuestions", async function POST(req: NextRequest) {
  try {
    const { topic, resultText } = (await req.json()) as { topic?: string; resultText?: string };
    if (!topic || !resultText) {
      return NextResponse.json({ error: "topic과 resultText가 필요합니다." }, { status: 400 });
    }
    const questions = await generateExpectedQuestions(topic, resultText);
    return NextResponse.json({ questions });
  } catch (err) {
    console.error("[/api/tasks/expected-questions] failed", err);
    return NextResponse.json(
      { error: "예상 질문 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
});
