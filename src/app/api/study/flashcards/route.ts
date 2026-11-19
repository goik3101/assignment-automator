import { NextRequest } from "next/server";
import { routeUsage } from "@/lib/llm/route-usage";
import { runStudyRoute } from "@/lib/study/route";
import { makeFlashcards } from "@/lib/study/tools";
import { sanitizeFlashcardPrefs } from "@/lib/study/prefs";

export const maxDuration = 90;

// 과제 화면의 "플래시카드": 암기할 것(인물·연도·개념·주장)을 앞면/뒷면 카드로 만든다. 장 수는 설정 > AI 설정 값(body.prefs).
export const POST = routeUsage("studyFlashcards", async function POST(req: NextRequest) {
  return runStudyRoute(req, { kind: "flashcards", requireContext: true }, async ({ body, context }) => ({
    cards: await makeFlashcards(context!, sanitizeFlashcardPrefs(body.prefs ?? { count: body.count }).count),
  }));
});
