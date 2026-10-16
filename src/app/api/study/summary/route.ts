import { NextRequest } from "next/server";
import { routeUsage } from "@/lib/llm/route-usage";
import { runStudyRoute } from "@/lib/study/route";
import { makeSummary } from "@/lib/study/tools";

export const maxDuration = 90;

// 과제 화면의 "요약": 결과물(또는 학습 모드의 조사 자료·내 글)의 핵심을 추려 준다. 새 검색 없이 주어진 내용만 쓴다.
export const POST = routeUsage("studySummary", async function POST(req: NextRequest) {
  return runStudyRoute(req, { kind: "summary", requireContext: true }, async ({ context }) => makeSummary(context!));
});
