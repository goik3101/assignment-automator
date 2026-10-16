// 퀴즈 문항 검증(순수 함수 — 테스트에서 바로 불러올 수 있게 alias import 없음).
export interface QuizQuestion {
  type: "choice" | "ox";
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
}

/** 모델이 준 문항이 풀 수 있는 형태인지 검사한다(보기 수·정답 번호·중복 보기). */
export function validateQuizQuestion(q: Partial<QuizQuestion> & { answer_index?: number }): QuizQuestion | null {
  const question = q.question?.trim();
  const explanation = q.explanation?.trim() ?? "";
  const answerIndex = q.answerIndex ?? q.answer_index;
  if (!question || (q.type !== "choice" && q.type !== "ox") || !Array.isArray(q.choices)) return null;
  const choices = q.choices.map((c) => String(c).trim());
  if (q.type === "ox") {
    if (choices.length !== 2) return null;
  } else {
    if (choices.length !== 4 || choices.some((c) => !c) || new Set(choices.map((c) => c.replace(/\s/g, ""))).size !== 4) return null;
  }
  if (typeof answerIndex !== "number" || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= choices.length) return null;
  return { type: q.type, question, choices, answerIndex, explanation };
}

