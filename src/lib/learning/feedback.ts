import { generate } from "@/lib/llm";
import { Type, type Schema } from "@google/genai";
import { LEARNING_FEEDBACK_RULES } from "./prompts";
import type { FeedbackIssue, LearningFeedback, RequirementCheck } from "@/types/learning";

export interface FeedbackInput {
  subject: string;
  topic: string;
  requirements: string[];
  sectionLabel: string;
  focusSubject?: string | null;
  /** 이 항목에서 학생에게 제공한 조사 자료(markdown) — 사실관계 대조의 기준. */
  researchContent: string;
  draft: string;
  /** 직전 피드백 요약 — 학생이 어떤 지적을 고쳤는지 이어서 볼 수 있게 한다. */
  previousSummary?: string;
  /** 학생이 표현·문법 등을 직접 질문한 경우. */
  question?: string;
}

const ISSUE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    excerpt: { type: Type.STRING, description: "학생 글에서 문제가 된 부분을 짧게 인용" },
    problem: { type: Type.STRING, description: "무엇이 문제인지" },
    hint: { type: Type.STRING, description: "어떻게 고치면 좋을지 방향만 — 완성된 정답 문장 금지" },
  },
  required: ["excerpt", "problem", "hint"],
};

const FEEDBACK_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: "전체 평가 1~2문장" },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING }, description: "잘 쓴 부분(구체적으로)" },
    missing: { type: Type.ARRAY, items: { type: Type.STRING }, description: "빠졌거나 더 설명하면 좋은 내용(방향만)" },
    factIssues: { type: Type.ARRAY, items: ISSUE_SCHEMA, description: "사실관계 문제 또는 출처로 확인해볼 것" },
    requirementCoverage: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          requirement: { type: Type.STRING },
          met: { type: Type.BOOLEAN },
          note: { type: Type.STRING },
        },
        required: ["requirement", "met", "note"],
      },
    },
    languageIssues: { type: Type.ARRAY, items: ISSUE_SCHEMA, description: "문장·문법·논리 문제" },
    nextSteps: { type: Type.ARRAY, items: { type: Type.STRING }, description: "다음에 할 일(수정 방향)" },
    readyToComplete: { type: Type.BOOLEAN, description: "이 항목을 완료해도 될 만큼 충분히 썼는가" },
    answer: { type: Type.STRING, description: "학생 질문이 있을 때만 그 답변. 없으면 빈 문자열." },
  },
  required: [
    "summary",
    "strengths",
    "missing",
    "factIssues",
    "requirementCoverage",
    "languageIssues",
    "nextSteps",
    "readyToComplete",
  ],
};

function buildPrompt(input: FeedbackInput): string {
  return `
너는 한국 고등학생의 수행평가 답변을 평가하는 조교다. 학생이 스스로 고쳐 쓸 수 있도록 피드백만 준다.

[과목] ${input.subject}
[과제 주제] ${input.topic}
[과제 요구사항]
${input.requirements.map((r) => `- ${r}`).join("\n") || "(명시된 요구사항 없음)"}
${input.focusSubject ? `[다루는 대상] ${input.focusSubject}\n` : ""}[지금 평가할 항목] ${input.sectionLabel}

[참고 자료 — 학생에게 제공한 조사 자료. 사실관계 대조의 기준]
${input.researchContent || "(이 항목의 조사 자료 없음 — 사실관계는 확인이 필요하다고만 표현할 것)"}

[학생이 쓴 답변]
${input.draft}
${input.previousSummary ? `\n[직전 피드백 요약 — 학생이 이후 고쳐 쓴 것이니 달라진 점을 반영해서 평가할 것]\n${input.previousSummary}\n` : ""}${input.question ? `\n[학생의 질문 — answer 필드에 필요한 범위에서 답할 것. 표현·문법 설명은 해도 되지만 답변 전체를 대신 써주지는 말 것]\n${input.question}\n` : ""}
${LEARNING_FEEDBACK_RULES}
`.trim();
}

const MAX_TEXT = 220;
const clip = (s: unknown) => (typeof s === "string" ? s.trim().slice(0, MAX_TEXT) : "");
const clipList = (a: unknown, max = 4) =>
  Array.isArray(a) ? a.map(clip).filter(Boolean).slice(0, max) : [];
const clipIssues = (a: unknown, max = 4): FeedbackIssue[] =>
  Array.isArray(a)
    ? a
        .map((i) => ({ excerpt: clip(i?.excerpt), problem: clip(i?.problem), hint: clip(i?.hint) }))
        .filter((i) => i.problem)
        .slice(0, max)
    : [];

export async function generateLearningFeedback(input: FeedbackInput): Promise<LearningFeedback> {
  const response = await generate({
      label: "learning:feedback",
      role: "main",
      prompt: buildPrompt(input),
      schema: FEEDBACK_SCHEMA,
    });
  const raw = response.text;
  if (!raw) throw new Error("피드백 응답이 비어 있습니다.");
  const p = JSON.parse(raw) as Record<string, unknown>;

  const coverage: RequirementCheck[] = Array.isArray(p.requirementCoverage)
    ? p.requirementCoverage
        .map((r) => ({ requirement: clip(r?.requirement), met: r?.met === true, note: clip(r?.note) }))
        .filter((r) => r.requirement)
        .slice(0, 8)
    : [];

  // 답변이 너무 길면(=학생 글을 통째로 대신 써주는 형태일 위험) 잘라낸다.
  const answer = typeof p.answer === "string" && p.answer.trim() ? p.answer.trim().slice(0, 600) : undefined;

  return {
    summary: clip(p.summary),
    strengths: clipList(p.strengths),
    missing: clipList(p.missing),
    factIssues: clipIssues(p.factIssues),
    requirementCoverage: coverage,
    languageIssues: clipIssues(p.languageIssues),
    nextSteps: clipList(p.nextSteps),
    readyToComplete: p.readyToComplete === true,
    ...(answer ? { answer } : {}),
    createdAt: new Date().toISOString(),
  };
}
