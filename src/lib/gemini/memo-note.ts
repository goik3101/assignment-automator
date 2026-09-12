import { Type } from "@google/genai";
import { getGeminiClient, GEMINI_MODELS } from "./client";
import type { EssayResult, PlanResult, MemoNote } from "@/types/task";

// 기획서 9-2: 암기노트 — 서비스가 이미 생성한 원고/계획서에서 핵심만 뽑아 정리.
// 새로 검색하거나 사실을 지어내지 않는다 — 이미 있는 텍스트를 압축·요약만 한다.
// 그래서 검색 그라운딩 없이 저렴한 Flash-Lite로 충분하다.

const MEMO_NOTE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    keywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "핵심 키워드 3~5개",
    },
    summary_points: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "시험 전에 훑어보면 되는 핵심 문장 3~6개. 원문에 없는 내용을 새로 지어내지 말 것.",
    },
  },
  required: ["keywords", "summary_points"],
};

function resultToPlainText(result: EssayResult | PlanResult): string {
  if (result.type === "essay") return result.markdown;
  return result.content;
}

export async function generateMemoNote(result: EssayResult | PlanResult): Promise<MemoNote> {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: GEMINI_MODELS.flashLite,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `아래는 학생이 이미 완성한 수행평가 결과물이다. 시험이나 발표 직전에 빠르게
훑어볼 수 있는 "암기노트"로 압축해줘. 원문에 없는 사실을 새로 지어내지 말고,
있는 내용만 골라 요약할 것.

[결과물]
${resultToPlainText(result)}`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: MEMO_NOTE_SCHEMA,
    },
  });

  const raw = response.text;
  if (!raw) throw new Error("암기노트 생성 응답이 비어 있습니다.");
  return JSON.parse(raw) as MemoNote;
}
