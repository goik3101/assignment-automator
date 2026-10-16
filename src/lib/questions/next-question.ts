import { Type, type Schema } from "@google/genai";
import { generateJson } from "@/lib/llm";
import type { CoreTaskInfo } from "@/types/task";
import { QUESTION_CAP, sanitizeQuestion, type AiMode, type PreAnswer, type PreQuestion } from "./questions-pure";

// 수행평가를 만들기 전에 학생에게 물어볼 "다음 질문 하나"를 정한다. 목표는 불필요한 질문을 줄이고,
// 결과물의 품질과 학생의 선택에 실제로 영향을 주는 정보만 모으는 것 — 질문이 필요 없으면 아무것도 묻지 않는다.
// 개수 상한(빠르게 2개 / 나에게 맞추기 4개)은 모델이 아니라 코드가 강제한다.

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    needed: { type: Type.BOOLEAN, description: "지금 학생에게 꼭 물어봐야 할 것이 있는가. 없으면 false." },
    reason: { type: Type.STRING, description: "판단 근거 한 줄(학생에게 보여주지 않음)" },
    question: {
      type: Type.OBJECT,
      nullable: true,
      description: "needed가 true일 때만. 핵심 의사결정 하나만 담은 질문.",
      properties: {
        text: { type: Type.STRING, description: "학생에게 보여줄 질문(60자 안팎, 존댓말 \"~요\")" },
        kind: { type: Type.STRING, enum: ["choice", "personal"], description: "choice=방향을 고르는 선택형, personal=학생 본인의 경험·생각·상황" },
        options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "choice면 서로 다른 보기 2~5개(짧게). personal이면 빈 배열이거나 흔한 답 예시 2~3개." },
        allow_other: { type: Type.BOOLEAN, description: "보기 밖의 직접 입력을 허용할지" },
        why: { type: Type.STRING, description: "왜 묻는지 한 줄(예: 결과물의 주제가 이 선택에 따라 달라져요)" },
        decision_key: { type: Type.STRING, description: "이 질문이 정하려는 결정의 이름을 영문 소문자 snake_case로(예: person_choice, book_title, event_role). 같은 결정이면 반드시 같은 값." },
      },
      required: ["text", "kind", "options", "allow_other", "why", "decision_key"],
    },
  },
  required: ["needed", "reason"],
};

const RULES = `
[수행평가 제작 전 질문 판단 규칙]
목표: 학생에게 불필요한 질문을 최소화하고, 결과물의 품질과 학생의 선택에 실질적인 영향을 주는 정보만 수집한다.

1. 먼저 확인할 정보: 안내문(과제 분석), 학생이 입력한 상세 설명, 이전 질문의 답변, 이미 선택한 주제와 옵션. 이미 확보된 정보는 다시 묻지 않는다.

2. 질문이 필요한 경우(아래 중 하나에 해당하고, 필요한 정보가 아직 없을 때만):
- 학생이 주제·인물·작품·사회문제 등을 선택해야 하고, 선택에 따라 결과물이 크게 달라지는 경우
- 안내문이 학생 자신의 생각·판단·감상을 요구하는데, 쓰는 데 필요한 정보가 부족한 경우
- 학생 본인이나 주변 사람의 실제 경험·상황이 과제의 핵심인데 관련 정보가 없는 경우
- 결과물의 핵심 방향을 정할 정보가 없고, AI가 임의로 정하면 학생이 원하는 결과와 크게 달라질 가능성이 있는 경우

3. 질문하지 않는 경우:
- 안내문이나 상세 설명에 답이 이미 있는 경우
- AI가 신뢰할 수 있는 자료를 조사해 해결할 수 있는 경우(사실·통계·역사·책 내용 등)
- AI가 합리적으로 정해도 결과물의 품질에 큰 영향이 없는 경우
- 결과물에 영향을 거의 주지 않는 세부 취향인 경우(문체 톤, 분량 같은 사소한 것)
- 학생이 AI에게 결정하도록 맡긴 경우(이전 답이 "AI에게 맡김"이면 같은 결정은 다시 묻지 않는다)

4. 질문 방식:
- 객관식·선택형을 우선한다. 질문 하나에는 핵심 의사결정 하나만 담는다.
- 답이 결과물의 주제·관점·내용을 실제로 바꿔야 한다.
- 개인적인 생각이나 경험은 학생이 제공한 정보만 쓴다. 임의로 지어내지 않는다. 개인 정보를 주고 싶지 않은 학생은 나중에 직접 쓰도록 허용된다(화면에서 처리).
- 질문 문장은 60자 안팎으로 짧게, 한 번에 한 가지만 묻는다(여러 항목을 나열해 한꺼번에 답하게 하지 않는다).
- 보기는 서로 다른 선택지만 넣는다. "직접 입력"·"AI에게 맡김"·"상관없음" 같은 보기는 화면이 따로 제공하니 넣지 않는다.
- 학생 본인의 생각·감정·경험을 AI가 대신 지어 쓰는 선택지는 만들지 않는다.
- 개인 내용을 AI가 어떻게 처리할지(빈칸으로 둘지, 일반적인 문장으로 대신 쓸지, 학생 관점으로 쓸지)는 묻지 않는다. 그건 서비스 규칙이다 — 학생이 알려주지 않은 개인 내용은 학생이 직접 채울 빈칸으로 남긴다. personal 질문은 학생 본인의 실제 이야기(맡은 역할, 겪은 일, 이유)에 대한 것만 묻는다.
- 한 질문 안에 여러 항목을 나열해 한꺼번에 답하게 하지 않는다(예: "역할, 장면, 배운 점을 각각 적어 주세요" 금지). 가장 중요한 하나만 묻는다.
- personal 질문도 한 가지만 묻는다. 보기는 항목 나열이 아니라 흔한 답 예시 2~3개만(없어도 됨).
- 이전 질문과 같은 결정(같은 인물·책·역할 등)은 다시 묻지 않는다. 이미 답이 있으면 그 결정은 끝난 것이다.
- 질문 개수를 채우려고 불필요한 질문을 만들지 않는다. 필요한 질문이 없으면 needed=false.

5. 최종 판단 — 묻기 전에 확인: (1) 이미 제공됐는가? (2) AI가 스스로 결정하거나 조사할 수 있는가? (3) 학생의 답에 따라 결과물이 실질적으로 달라지는가? (4) 이 질문이 남은 질문 한도 안에서 우선순위가 높은가?
이미 제공됐거나 AI가 해결할 수 있는 정보는 묻지 않는다. 학생의 답이 결과물에 실질적 영향을 주는 미확정 정보만 묻는다.
`.trim();

function describeTask(subject: string, info: CoreTaskInfo, instructions: string): string {
  return [
    `[과목] ${subject}`,
    `[과제 주제] ${info.topic}`,
    `[요구사항]\n${info.requirements.map((r) => `- ${r}`).join("\n") || "(없음)"}`,
    `[만들 결과물]\n${info.task_elements
      .map((e) => `- ${e.label}${e.type === "external_production" ? "(외부 툴로 제작)" : ""}: ${e.description}${e.required_items?.length ? ` (항목: ${e.required_items.join(", ")})` : ""}`)
      .join("\n")}`,
    `[학생이 입력한 상세 설명]\n${instructions.trim() || "(없음)"}`,
  ].join("\n");
}

export async function nextQuestion(params: {
  subject: string;
  info: CoreTaskInfo;
  instructions: string;
  answers: PreAnswer[];
  mode: AiMode;
}): Promise<{ question: PreQuestion | null; remaining: number }> {
  const cap = QUESTION_CAP[params.mode];
  const left = cap - params.answers.length;
  if (left <= 0) return { question: null, remaining: 0 };

  const answered = params.answers.length
    ? params.answers
        .map((a) => `- ${a.question} → ${a.state === "later" ? "(나중에 직접 쓰겠다고 함)" : a.state === "delegate" ? "(AI에게 맡김)" : a.answer}`)
        .join("\n")
    : "(아직 없음)";

  const { data } = await generateJson<{ needed: boolean; reason: string; question?: unknown }>({
    label: "questions:next",
    role: "lite",
    schema: SCHEMA,
    effort: "low",
    prompt: `${RULES}\n\n이번 모드의 질문 한도는 최대 ${cap}개이고, 지금까지 ${params.answers.length}개를 물었다(남은 한도 ${left}개).\n다음에 물어볼 질문이 정말 필요한지 판단하고, 필요하면 질문 하나만 만들어줘.\n\n${describeTask(params.subject, params.info, params.instructions)}\n\n[이전 질문과 답변]\n${answered}`,
  });

  if (!data.needed) return { question: null, remaining: left };
  const question = sanitizeQuestion(data.question, params.answers);
  return { question, remaining: question ? left - 1 : left };
}
