import { Type } from "@google/genai";
import { getGeminiClient, GEMINI_MODELS } from "./client";

// 9-3: 예상 질문 생성 (조건부, 구술·발표형 과제일 때만). 이미 만들어진 결과물을
// 바탕으로 질문만 뽑는 것이라 검색 그라운딩 없이 Flash-Lite로 충분하다.
const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "발표 후 선생님이나 친구들이 물어볼 법한 예상 질문 4~6개",
    },
  },
  required: ["questions"],
};

export async function generateExpectedQuestions(topic: string, resultText: string): Promise<string[]> {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: GEMINI_MODELS.flashLite,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `아래는 "${topic}"라는 발표/구술 과제를 위해 학생이 준비한 내용이다.
발표가 끝난 뒤 선생님이나 친구들이 물어볼 법한 예상 질문을 4~6개 뽑아줘.
너무 뻔한 질문("어떤 내용이었나요?" 같은)은 피하고, 내용을 실제로 이해했는지
확인하는 구체적인 질문 위주로 만들어줘.

[준비한 내용]
${resultText}`,
          },
        ],
      },
    ],
    config: { responseMimeType: "application/json", responseSchema: SCHEMA },
  });

  const raw = response.text;
  if (!raw) throw new Error("예상 질문 생성 응답이 비어 있습니다.");
  return (JSON.parse(raw) as { questions: string[] }).questions;
}
