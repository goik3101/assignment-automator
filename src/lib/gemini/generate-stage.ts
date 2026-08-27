import { Type, type Schema } from "@google/genai";
import { getGeminiClient, GEMINI_MODELS } from "./client";
import {
  ANTI_AI_TONE_RULES,
  COPYRIGHT_RULES,
  NO_META_COMMENTARY_RULE,
  CITATION_JUDGMENT_RULE,
  PERSPECTIVE_RULE,
} from "./prompts";
import { buildSourceList, insertCitationMarkers } from "./citations";
import { validateSources } from "@/lib/links/validate-sources";
import { withGeminiRetry } from "./retry";
import type { CoreTaskInfo, SourceRef } from "@/types/task";

// 다단계 세션의 한 단계를 생성한다. generate-plan.ts와 같은 이유로 2단계로 나눈다 —
// Gemini는 검색 그라운딩(tools)과 구조화된 출력(responseSchema)을 한 호출에서
// 함께 쓰는 게 불안정해서, 1차 그라운딩 자유 텍스트 → 2차 구조화 변환으로 분리한다.

export interface GenerateStageInput {
  subject: string;
  coreTaskInfo: CoreTaskInfo;
  stageName: string;
  /** 이 단계에서 학생이 입력한 지침/방향 (예: "5분 발표 대본으로") */
  stageInstructions?: string;
  /** 이전 모든 단계를 직렬화한 텍스트. task-sessions.ts의 serializePriorStages() 결과. */
  priorStagesText: string;
}

export interface StageResult {
  outputText: string;
  outputFacts: Record<string, string>;
  sources: SourceRef[];
}

const FACTS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    output_text: {
      type: Type.STRING,
      description: "학생에게 그대로 보여줄 본문. 메타 설명이나 헤더 라벨 없이 순수 내용만.",
    },
    output_facts: {
      type: Type.ARRAY,
      description:
        "이번 단계에서 새로 확정된 핵심 사실들 (다음 단계로 그대로 넘겨야 하는 값). " +
        "예: 책을 처방했다면 book_title/book_author/quote. 확정할 새 사실이 없으면 빈 배열.",
      items: {
        type: Type.OBJECT,
        properties: {
          key: { type: Type.STRING, description: "예: book_title, book_author, quote, friend_name" },
          value: { type: Type.STRING },
        },
        required: ["key", "value"],
      },
    },
  },
  required: ["output_text", "output_facts"],
};

function buildStagePrompt(input: GenerateStageInput): string {
  const continuityBlock = input.priorStagesText
    ? `
【중요 — 반드시 지킬 것】
아래는 같은 수행평가 세션에서 이미 진행된 이전 단계들이다. 등장인물 이름,
사연·고민의 구체적 내용, 이미 처방/선택한 대상(책 등)의 이름과 세부사항처럼
이미 확정된 구체적 사실은 절대 바꾸거나 새로 지어내지 말고 그대로 이어서
사용할 것. 지금 만들 단계는 이 흐름을 이어가는 다음 단계일 뿐이다.

${input.priorStagesText}
`.trim() + "\n\n"
    : "";

  return `
${continuityBlock}너는 한국 고등학생의 수행평가를 돕는 도우미다. 여러 차시에 걸친 과제 중
지금은 "${input.stageName}" 단계를 작성해야 한다.

[과목] ${input.subject}
[과제 주제] ${input.coreTaskInfo.topic}
[요구사항]
${input.coreTaskInfo.requirements.map((r) => `- ${r}`).join("\n") || "(명시된 요구사항 없음)"}
${input.stageInstructions ? `[이 단계에 대한 지침]\n${input.stageInstructions}` : ""}

구체적 사실(책 정보, 줄거리, 인용구 등)이 필요하면 반드시 실시간 검색으로 확인한 뒤 쓸 것.
${ANTI_AI_TONE_RULES}
${COPYRIGHT_RULES}
${NO_META_COMMENTARY_RULE}
${CITATION_JUDGMENT_RULE}
${PERSPECTIVE_RULE}
`.trim();
}

export async function generateStage(input: GenerateStageInput): Promise<StageResult> {
  const ai = getGeminiClient();
  const prompt = buildStagePrompt(input);
  console.log(`[generateStage] stage="${input.stageName}" prompt:\n${prompt}`);

  // 1차: 검색 그라운딩 켠 자유 텍스트 생성.
  const stageA = await withGeminiRetry(
    () =>
      ai.models.generateContent({
        model: GEMINI_MODELS.flash,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { tools: [{ googleSearch: {} }] },
      }),
    "generateStage:stepA"
  );

  const freeText = stageA.text;
  if (!freeText) throw new Error("AI가 빈 응답을 반환했습니다.");

  const grounding = stageA.candidates?.[0]?.groundingMetadata;
  const { sources, chunkIndexToN } = buildSourceList(grounding?.groundingChunks);
  const annotated = insertCitationMarkers(freeText, grounding?.groundingSupports, chunkIndexToN);
  const validatedSources = await validateSources(sources);

  // 2차: 본문은 그대로 두고, 이번 단계에서 확정된 핵심 사실만 구조화해서 뽑는다
  // (그라운딩 없이, 순수 추출 작업).
  const stageB = await withGeminiRetry(
    () =>
      ai.models.generateContent({
        model: GEMINI_MODELS.flashLite,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `
아래 글에서 다음 단계로 반드시 그대로 넘겨야 할 "새로 확정된 핵심 사실"만 뽑아줘
(등장인물 이름, 처방/선택한 대상의 이름과 세부사항 등). 본문(output_text)은
아래 글을 각주 표기([1], [2] 등) 그대로 유지한 채 다듬지 말고 그대로 옮겨줘.

[글]
${annotated}
`.trim(),
              },
            ],
          },
        ],
        config: { responseMimeType: "application/json", responseSchema: FACTS_SCHEMA },
      }),
    "generateStage:stepB"
  );

  const raw = stageB.text;
  if (!raw) throw new Error("단계 구조화 응답이 비어 있습니다.");
  const parsed = JSON.parse(raw) as { output_text: string; output_facts: { key: string; value: string }[] };

  const outputFacts: Record<string, string> = {};
  for (const f of parsed.output_facts) outputFacts[f.key] = f.value;

  console.log(`[generateStage] stage="${input.stageName}" 추출된 output_facts=${JSON.stringify(outputFacts)}`);

  // 안전장치: 실제로 그라운딩이 안 됐는데(출처 0개) 본문에 [1][2] 같은 각주 모양이
  // 남아있으면 근거 없는 각주이므로 지운다 (이전 단계 텍스트를 참고하다가 각주
  // "모양"만 흉내 내는 경우가 실제로 있었다).
  const outputText =
    validatedSources.length === 0 ? annotated.replace(/\[\d+\]/g, "") : annotated;

  return {
    outputText,
    outputFacts,
    sources: validatedSources,
  };
}
