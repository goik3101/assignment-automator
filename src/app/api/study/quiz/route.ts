import { NextRequest } from "next/server";
import { routeUsage } from "@/lib/llm/route-usage";
import { runStudyRoute } from "@/lib/study/route";
import { makeQuiz } from "@/lib/study/tools";
import { sanitizeQuizPrefs } from "@/lib/study/prefs";

export const maxDuration = 120;

// 과제 화면의 "퀴즈": 결과물을 읽었다면 풀 수 있는 문제(객관식·OX·주관식·빈칸). 정답과 해설도 함께 내려준다(채점은 화면에서).
// 문제 유형·난이도·생성 방식·문항 수는 설정 > AI 설정 값(body.prefs)을 따른다.
export const POST = routeUsage("studyQuiz", async function POST(req: NextRequest) {
  return runStudyRoute(req, { kind: "quiz", requireContext: true }, async ({ body, context }) => ({
    questions: await makeQuiz(context!, sanitizeQuizPrefs(body.prefs ?? { count: body.count })),
  }));
});
