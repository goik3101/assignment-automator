import { routeUsage } from "@/lib/llm/route-usage";
import { NextRequest } from "next/server";
import { generateExpectedQuestions } from "@/lib/gemini/expected-questions";
import { runStudyRoute, str, StudyInputError } from "@/lib/study/route";

// 입력 길이 상한 — 완성 원고(수천 자)보다 넉넉하게 두되, 임의로 긴 글이 그대로 모델로 가지 않게 한다.
const MAX_TOPIC_CHARS = 300;
const MAX_RESULT_CHARS = 30_000;

// 9-3: 예상 질문 생성. 이미 만든 결과물을 바탕으로 뽑는 가벼운 보조 기능이라 비로그인도 쓸 수 있지만,
// 비용 방어를 위해 하루 횟수 제한(+비로그인은 IP 상한)은 건다.
export const POST = routeUsage("expectedQuestions", async function POST(req: NextRequest) {
  return runStudyRoute(
    req,
    { kind: "expected_questions", allowGuest: true, failureMessage: "예상 질문 생성 중 오류가 발생했습니다." },
    async ({ body }) => {
      const topic = str(body.topic, MAX_TOPIC_CHARS).trim();
      const resultText = str(body.resultText, MAX_RESULT_CHARS).trim();
      if (!topic || !resultText) throw new StudyInputError("topic과 resultText가 필요합니다.");
      return { questions: await generateExpectedQuestions(topic, resultText) };
    }
  );
});
