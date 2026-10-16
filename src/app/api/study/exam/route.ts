import { NextRequest } from "next/server";
import { routeUsage } from "@/lib/llm/route-usage";
import { runStudyRoute } from "@/lib/study/route";
import { makeExam } from "@/lib/study/tools";

export const maxDuration = 90;

// 과제 화면의 "가상 시험": 빈 종이에 시험 주제만 받아 직접 써 보는 서술형 문제 1개 + 단계별 힌트 + 숨겨 둔 채점 기준.
export const POST = routeUsage("studyExam", async function POST(req: NextRequest) {
  return runStudyRoute(req, { kind: "exam", requireContext: true }, async ({ context }) => makeExam(context!));
});
