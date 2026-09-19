import { Type, type Schema } from "@google/genai";
import { getGeminiClient, GEMINI_MODELS } from "@/lib/gemini/client";
import { withGeminiRetry } from "@/lib/gemini/retry";
import { ACHIEVEMENT_INTERPRETATION_RULES } from "@/lib/gemini/prompts";
import { buildRecommendationGuidance } from "@/lib/recommendations/recommendation-diversity";
import type { SubjectCandidate } from "@/types/learning";
import type { CoreTaskInfo } from "@/types/task";

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    candidates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "인물/대상 이름(널리 쓰이는 표기)" },
          reason: { type: Type.STRING, description: "이 과제 조건에 실제로 부합하는 이유 한 줄" },
        },
        required: ["name", "reason"],
      },
    },
  },
  required: ["candidates"],
};

/**
 * "AI 추천" — 학생이 다룰 인물/대상을 고르도록 후보 3개를 제안한다. 학습 모드에서는
 * 후보를 보여주기만 하고 학생이 고른다. 최근 자주 선택된 대상은 자동 작성 모드와
 * 같은 이력(recommendation_history)을 읽기 전용으로 참고해 후보가 한쪽으로 쏠리지
 * 않게 한다 — 학습 모드의 선택을 그 이력에 기록하지는 않는다(통계 오염 방지).
 */
export async function suggestSubjectCandidates(params: {
  subject: string;
  info: CoreTaskInfo;
  instructions?: string | null;
  userId?: string;
}): Promise<SubjectCandidate[]> {
  const guidance = await buildRecommendationGuidance("subject", { userId: params.userId });
  const ai = getGeminiClient();
  const prompt = `
너는 고등학생이 수행평가에서 다룰 인물/대상을 고르는 것을 돕는 조교다. 아래 과제에 어울리는 실존하는
후보 3명(또는 3개)을 제안해줘. 최종 선택은 학생이 한다.

[과목] ${params.subject}
[과제 주제] ${params.info.topic}
[요구사항]
${params.info.requirements.map((r) => `- ${r}`).join("\n") || "(없음)"}
${params.instructions ? `[학생 지침]\n${params.instructions}\n` : ""}${guidance ? `\n${guidance.instructionText}\n` : ""}
반드시 실시간 웹 검색을 실제로 호출해서 각 후보가 실존하는지와 과제 조건에 직접 부합하는지 확인할 것.
서로 다른 분야·시대·지역에서 고르고, 단순히 유명하거나 검증하기 쉽다는 이유로 고르지 말 것.
각 후보마다 이름과 이 과제 조건에 부합하는 이유를 한 줄로 적을 것. 외국 인물의 이름은 한국에서 통용되는
표준 표기로 띄어쓰기를 지켜 쓰고(예: 바르톨로메 데 라스 카사스) 필요하면 원어를 괄호로 병기할 것.
${ACHIEVEMENT_INTERPRETATION_RULES}
`.trim();

  const investigation = await withGeminiRetry(
    () =>
      ai.models.generateContent({
        model: GEMINI_MODELS.flash,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { tools: [{ googleSearch: {} }] },
      }),
    "learning:suggest:investigate"
  );
  const memo = investigation.text;
  if (!memo) return [];

  const extraction = await withGeminiRetry(
    () =>
      ai.models.generateContent({
        model: GEMINI_MODELS.flashLite,
        contents: [
          { role: "user", parts: [{ text: `아래 메모에서 제안된 후보(이름+이유)를 구조화해줘.\n\n${memo}` }] },
        ],
        config: { responseMimeType: "application/json", responseSchema: SCHEMA },
      }),
    "learning:suggest:extract"
  );
  try {
    const parsed = JSON.parse(extraction.text ?? "{}") as { candidates?: SubjectCandidate[] };
    return (parsed.candidates ?? [])
      .filter((c) => c.name?.trim())
      .map((c) => ({ name: c.name.trim(), reason: (c.reason ?? "").trim().slice(0, 160) }))
      .slice(0, 3);
  } catch {
    return [];
  }
}
