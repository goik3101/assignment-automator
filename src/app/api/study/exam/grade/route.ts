import { NextRequest } from "next/server";
import { routeUsage } from "@/lib/llm/route-usage";
import { runStudyRoute, str, StudyInputError } from "@/lib/study/route";
import { gradeExam } from "@/lib/study/tools";

export const maxDuration = 90;

// 가상 시험 채점: 학생이 쓴 답안을 과제 내용과 비교해 점수·잘한 점·빠진 점·사실 오류를 알려 준다.
export const POST = routeUsage("studyExamGrade", async function POST(req: NextRequest) {
  return runStudyRoute(req, { kind: "exam_grade", requireContext: true }, async ({ body, context }) => {
    const task = str(body.task, 600).trim();
    const answer = str(body.answer, 6000).trim();
    if (!task) throw new StudyInputError("시험 문제가 없어요. 시험을 다시 시작해 주세요.");
    if (answer.length < 20) throw new StudyInputError("답안을 조금 더 써 주세요(20자 이상).");
    const keyPoints = Array.isArray(body.keyPoints) ? body.keyPoints.filter((k): k is string => typeof k === "string").map((k) => k.slice(0, 300)).slice(0, 8) : [];
    return gradeExam(context!, { task, keyPoints }, answer);
  });
});
