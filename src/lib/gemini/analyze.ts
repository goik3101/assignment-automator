import { Type, type Schema } from "@google/genai";
import { getGeminiClient, GEMINI_MODELS } from "./client";
import type { AnalyzeResult } from "@/types/task";

// 기획서 6-0 1단계: 안내문에서 administrative_info(제출기한 등)와
// core_task_info(주제·요구사항 등)를 "물리적으로 분리"해서 추출한다.
// 이 스키마 강제는 그라운딩 없는 이미지 분석 단계에 적용되는 것으로,
// 검색+생성 단계(5-1)의 그라운딩+JSON 이슈와는 별개다.
const ANALYZE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    subject: { type: Type.STRING, description: "과목명 (예: 국어, 과학)" },
    insufficient_data: {
      type: Type.BOOLEAN,
      description:
        "사진이 흐릿하거나 정보가 부족해 신뢰할 수 있는 분석이 불가능하면 true",
    },
    insufficient_reason: {
      type: Type.STRING,
      description: "insufficient_data가 true일 때 그 이유. 아니면 빈 문자열.",
    },
    administrative_info: {
      type: Type.OBJECT,
      properties: {
        due_date: { type: Type.STRING, description: "제출기한. 모르면 빈 문자열." },
        submission_method: { type: Type.STRING, description: "제출 방법. 모르면 빈 문자열." },
        grading_criteria: { type: Type.STRING, description: "감점/채점 기준. 모르면 빈 문자열." },
        other_notes: { type: Type.STRING, description: "기타 행정 안내사항. 모르면 빈 문자열." },
      },
      required: ["due_date", "submission_method", "grading_criteria", "other_notes"],
    },
    core_task_info: {
      type: Type.OBJECT,
      properties: {
        topic: { type: Type.STRING, description: "과제의 핵심 주제" },
        requirements: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "구체적으로 요구되는 조건들 (분량, 형식 등)",
        },
        task_elements: {
          type: Type.ARRAY,
          description:
            "이 과제가 요구하는 산출물 요소들. 한 과제에 여러 개가 섞일 수 있음 (예: 감상문+PPT)",
          items: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                enum: ["text_submission", "external_production"],
                description:
                  "text_submission = 글로 그대로 제출 가능 (감상문/서술/대본 등). " +
                  "external_production = 캔바·감마 등 외부 툴이나 물리적 제작이 필요 (PPT/포스터/모형 등)",
              },
              label: { type: Type.STRING, description: "짧은 이름 (예: 독서감상문, 발표 PPT)" },
              description: { type: Type.STRING, description: "이 요소에 대한 구체적 설명" },
            },
            required: ["type", "label", "description"],
          },
        },
      },
      required: ["topic", "requirements", "task_elements"],
    },
  },
  required: [
    "subject",
    "insufficient_data",
    "insufficient_reason",
    "administrative_info",
    "core_task_info",
  ],
};

const SYSTEM_INSTRUCTION = `
너는 한국 고등학교 수행평가 안내문을 분석하는 도우미다.
입력으로 안내문 사진 또는 학생이 직접 입력한 주제 텍스트, 그리고 선택적으로 학생이 추가한 지침을 받는다.
아래 스키마에 맞춰 정확히 JSON으로만 응답하라.

규칙:
- administrative_info(제출기한, 제출방법, 채점기준 등 "행정정보")와
  core_task_info(주제, 요구사항, 산출물 요소 등 "핵심정보")를 절대 섞지 말고 분리해서 채울 것.
- 사진 속 글씨가 흐릿하거나 손글씨라 읽기 어렵거나, 핵심 정보가 부족하면
  추측해서 채우지 말고 insufficient_data를 true로, insufficient_reason에 이유를 한 문장으로 적을 것.
- task_elements는 과제가 실제로 요구하는 만큼만 나열할 것 (보통 1~2개).
- 알 수 없는 필드는 빈 문자열이나 빈 배열로 둘 것 (추측 금지).
`.trim();

export interface AnalyzeInput {
  /** base64 인코딩된 이미지 데이터 (data URL 접두사 제외) */
  imageBase64?: string;
  imageMimeType?: string;
  /** 이미지 대신 주제를 텍스트로 직접 입력한 경우 (F1) */
  topicText?: string;
  /** 이번 과제 한정 지침 (F2) */
  instructions?: string;
}

export async function analyzeAssignment(
  input: AnalyzeInput
): Promise<AnalyzeResult> {
  if (!input.imageBase64 && !input.topicText) {
    throw new Error("imageBase64 또는 topicText 중 하나는 반드시 있어야 합니다.");
  }

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

  if (input.imageBase64 && input.imageMimeType) {
    parts.push({ inlineData: { data: input.imageBase64, mimeType: input.imageMimeType } });
  }

  const userTextLines = [
    input.topicText ? `[학생이 입력한 주제]\n${input.topicText}` : null,
    input.instructions ? `[이번 과제 한정 지침]\n${input.instructions}` : null,
    !input.imageBase64 && !input.topicText ? null : "위 내용을 분석해서 JSON으로 응답해줘.",
  ].filter(Boolean);
  parts.push({ text: userTextLines.join("\n\n") });

  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: GEMINI_MODELS.flashLite,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: ANALYZE_SCHEMA,
    },
  });

  const raw = response.text;
  if (!raw) {
    throw new Error("Gemini 분석 응답이 비어 있습니다.");
  }

  const parsed = JSON.parse(raw) as AnalyzeResult & {
    insufficient_reason: string;
  };

  return {
    ...parsed,
    insufficient_reason: parsed.insufficient_reason || null,
  };
}
