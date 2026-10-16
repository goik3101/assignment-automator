import { NextRequest } from "next/server";
import { routeUsage } from "@/lib/llm/route-usage";
import { runStudyRoute, int } from "@/lib/study/route";
import { makeQuiz } from "@/lib/study/tools";

export const maxDuration = 90;

// 과제 화면의 "퀴즈": 결과물을 읽었다면 풀 수 있는 객관식·OX 문제. 정답과 해설도 함께 내려준다(채점은 화면에서).
export const POST = routeUsage("studyQuiz", async function POST(req: NextRequest) {
  return runStudyRoute(req, { kind: "quiz", requireContext: true }, async ({ body, context }) => ({
    questions: await makeQuiz(context!, int(body.count, 3, 10, 6)),
  }));
});
