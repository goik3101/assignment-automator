import { NextRequest } from "next/server";
import { routeUsage } from "@/lib/llm/route-usage";
import { runStudyRoute, str, StudyInputError } from "@/lib/study/route";
import { validateCoreTaskInfo } from "@/lib/api/validate";
import { nextQuestion } from "@/lib/questions/next-question";
import { parseMode, QUESTION_CAP, sanitizeAnswers } from "@/lib/questions/questions-pure";
import type { CoreTaskInfo } from "@/types/task";

export const maxDuration = 60;

// 수행평가를 만들기 전, 결과물에 실제로 영향을 주는 미확정 정보만 학생에게 묻는다(질문 하나씩).
// 질문이 필요 없으면 question=null. 모드별 개수 상한은 서버가 강제한다(빠르게 2 / 나에게 맞추기 4). 비로그인도 쓸 수 있다.
export const POST = routeUsage("questions", async function POST(req: NextRequest) {
  return runStudyRoute(req, { kind: "questions", allowGuest: true }, async ({ body }) => {
    const info = body.coreTaskInfo as CoreTaskInfo;
    const invalid = validateCoreTaskInfo(info, body.instructions);
    if (invalid) throw new StudyInputError(invalid);
    const subject = str(body.subject, 60).trim();
    if (!subject) throw new StudyInputError("과목이 필요해요.");
    const mode = parseMode(body.mode);
    const answers = sanitizeAnswers(body.answers, QUESTION_CAP[mode]);
    return nextQuestion({ subject, info, instructions: str(body.instructions, 4000), answers, mode });
  });
});
