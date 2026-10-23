// 퀴즈 문항 검증(순수 함수 — 테스트에서 바로 불러올 수 있게 alias import 없음).
export interface QuizQuestion {
  /** choice=4지선다, ox=O/X, short=주관식(짧게 쓰기), blank=빈칸 채우기(문제 속 ____ 자리에 들어갈 말). */
  type: "choice" | "ox" | "short" | "blank";
  question: string;
  /** choice·ox만. short·blank는 빈 배열. */
  choices: string[];
  /** choice·ox만. short·blank는 -1. */
  answerIndex: number;
  explanation: string;
  /** short·blank의 정답. */
  answer?: string;
  /** short·blank에서 정답으로 인정할 다른 표기(정답 포함). */
  accepted?: string[];
}

type RawQuestion = Partial<QuizQuestion> & { answer_index?: number; answer_text?: string; accepted_answers?: string[] };

/** 모델이 준 문항이 풀 수 있는 형태인지 검사한다(보기 수·정답 번호·중복 보기·주관식 정답·빈칸 표시). */
export function validateQuizQuestion(q: RawQuestion): QuizQuestion | null {
  const question = q.question?.trim();
  const explanation = q.explanation?.trim() ?? "";
  if (!question) return null;

  if (q.type === "short" || q.type === "blank") {
    const answer = (q.answer ?? q.answer_text ?? "").trim();
    if (!answer || answer.length > 40) return null;
    if (q.type === "blank" && !/_{2,}/.test(question)) return null;
    const others = (q.accepted ?? q.accepted_answers ?? []).map((a) => String(a).trim()).filter(Boolean);
    const accepted = [answer, ...others].filter((a, i, all) => all.findIndex((b) => normalizeAnswer(b) === normalizeAnswer(a)) === i);
    return { type: q.type, question, choices: [], answerIndex: -1, explanation, answer, accepted };
  }

  const answerIndex = q.answerIndex ?? q.answer_index;
  if ((q.type !== "choice" && q.type !== "ox") || !Array.isArray(q.choices)) return null;
  const choices = q.choices.map((c) => String(c).trim());
  if (q.type === "ox") {
    if (choices.length !== 2) return null;
  } else {
    if (choices.length !== 4 || choices.some((c) => !c) || new Set(choices.map((c) => c.replace(/\s/g, ""))).size !== 4) return null;
  }
  if (typeof answerIndex !== "number" || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= choices.length) return null;
  return { type: q.type, question, choices, answerIndex, explanation };
}

/** 주관식 답 비교용: 대소문자·띄어쓰기·문장부호 차이는 무시한다. */
export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s.,·!?'"“”‘’()[\]{}<>「」『』《》〈〉\-_/]/g, "");
}

/** 학생이 쓴 답이 정답(또는 인정 표기) 중 하나와 같은지. */
export function isTextAnswerCorrect(input: string, q: Pick<QuizQuestion, "answer" | "accepted">): boolean {
  const got = normalizeAnswer(input);
  if (!got) return false;
  return [q.answer ?? "", ...(q.accepted ?? [])].some((a) => a && normalizeAnswer(a) === got);
}
