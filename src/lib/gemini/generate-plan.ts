import { Type, type Schema } from "@google/genai";
import { getGeminiClient, GEMINI_MODELS } from "./client";
import {
  ANTI_AI_TONE_RULES,
  NO_META_COMMENTARY_RULE,
  PERSPECTIVE_RULE,
  MULTI_DELIVERABLE_SEPARATION_RULE,
} from "./prompts";
import { buildSourceList } from "./citations";
import { validateSources } from "@/lib/links/validate-sources";
import { withGeminiRetry } from "./retry";
import type { CoreTaskInfo, PlanResult, InsufficientDataResult } from "@/types/task";

// 기획서 5-1: 실행 계획(PPT 구성안 등)은 JSON 구조화가 필수라서 2단계로 나눈다.
// 1차: 그라운딩 켠 상태로 자유 텍스트 생성 (인용 메타데이터를 살리기 위해)
// 2차: 그 텍스트를 구조화된 JSON으로 변환 (그라운딩 없이, 순수 포맷 변환만)
//
// 2차 변환에서 모델이 URL을 새로 지어내는 걸 막기 위해, 각 스텝은 URL 문자열이
// 아니라 1차 결과에서 확보한 출처 목록의 번호(source_n)만 고르게 한다.
// N2: 이 경로의 실제 레이턴시를 M1에서 최우선으로 실측한다 (8~12초 가능성).

const PLAN_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          order: { type: Type.INTEGER },
          task: { type: Type.STRING, description: "오늘 당장 할 일 (구체적으로)" },
          estimated_minutes: { type: Type.INTEGER },
          search_keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          source_n: {
            type: Type.INTEGER,
            description:
              "이 스텝과 관련된 출처 번호. 아래 [출처 목록]에 있는 번호만 쓸 것. 관련 출처가 없으면 0.",
          },
        },
        required: ["order", "task", "estimated_minutes", "search_keywords", "source_n"],
      },
    },
  },
  required: ["steps"],
};

export interface GeneratePlanInput {
  subject: string;
  coreTaskInfo: CoreTaskInfo;
  instructions?: string;
  avoidanceInstruction?: string;
  personalization?: string;
  /** F6 재생성 시 학생이 입력하는 "이번엔 이렇게 고쳐줘" 방향 (9-5) */
  revisionInstructions?: string;
  /** F6 재생성 시 이전 버전의 실제 결과 텍스트 (generate-essay.ts와 동일한 목적). */
  previousOutputText?: string;
}

function buildStepAPrompt(input: GeneratePlanInput): string {
  const element = input.coreTaskInfo.task_elements.find(
    (e) => e.type === "external_production"
  );

  const continuityBlock = input.previousOutputText
    ? `
【중요 — 반드시 지킬 것】
아래 [이전 버전]은 이전 단계에서 이미 확정된 내용이다. 등장인물 이름, 고민·사연의
구체적 내용(장소·상황·세부사항), 이미 처방/선택한 책의 제목·저자·구절 등 이미
정해진 구체적 사실은 절대 바꾸거나 새로 지어내지 말고 그대로 이어서 사용할 것.
오직 아래 [재생성 요청]에서 명시적으로 요청한 부분만 그 사실 위에서 수정할 것.

[이전 버전]
${input.previousOutputText}
`.trim() + "\n\n"
    : "";

  return `
${continuityBlock}너는 한국 고등학생의 수행평가 준비를 돕는 도우미다.
아래 과제는 PPT/포스터/모형처럼 외부 툴이나 물리적 제작이 필요한 산출물이라,
학생이 직접 만들 수 있도록 "실행 계획"을 세워줘야 한다 (완성물을 대신 만들어주지 않는다).

[과목] ${input.subject}
[과제 주제] ${input.coreTaskInfo.topic}
[요구사항]
${input.coreTaskInfo.requirements.map((r) => `- ${r}`).join("\n") || "(명시된 요구사항 없음)"}
[이 요소에 대한 설명] ${element?.description ?? ""}
${input.instructions ? `[학생이 추가로 입력한 지침]\n${input.instructions}` : ""}
${input.avoidanceInstruction ? `[다양성 확보를 위한 회피 지시 — 반드시 반영할 것]\n${input.avoidanceInstruction}` : ""}
${input.personalization ? `[학생 개인화 정보 — 자연스럽게 녹여낼 것]\n${input.personalization}` : ""}
${input.revisionInstructions ? `[재생성 요청 — 학생이 이전 결과물에 만족하지 못해 다시 요청함. 아래 방향을 반드시 반영해 새로 작성할 것]\n${input.revisionInstructions}` : ""}

필요한 사실(통계, 사례, 원문 정보 등)은 반드시 실시간 검색으로 확인하고,
확인이 안 되면 지어내지 말 것. 오늘 당장 할 일부터 순서대로,
각 단계마다 예상 소요시간과 검색해야 할 키워드를 함께 자연스러운 글로 정리해줘.
슬라이드/섹션 구성이 필요하면 몇 번째 슬라이드에 무엇을 넣을지도 구체적으로 언급해줘.
${ANTI_AI_TONE_RULES}
${NO_META_COMMENTARY_RULE}
${PERSPECTIVE_RULE}
${MULTI_DELIVERABLE_SEPARATION_RULE}
`.trim();
}

export async function generatePlan(
  input: GeneratePlanInput
): Promise<PlanResult | InsufficientDataResult> {
  const start = Date.now();
  const ai = getGeminiClient();

  // 1차: 검색 그라운딩 켠 자유 텍스트 생성
  let stepA;
  try {
    stepA = await withGeminiRetry(
      () =>
        ai.models.generateContent({
          model: GEMINI_MODELS.flash,
          contents: [{ role: "user", parts: [{ text: buildStepAPrompt(input) }] }],
          config: { tools: [{ googleSearch: {} }] },
        }),
      "generatePlan:stepA"
    );
  } catch (err) {
    console.error("[generatePlan] 1차 생성 재시도 후에도 실패", err);
    return {
      type: "insufficient_data",
      reason: "지금 검색 서비스가 불안정해서 계획을 만들지 못했어요. 잠시 후 다시 시도해주세요.",
    };
  }

  const freeText = stepA.text;
  if (!freeText) {
    return { type: "insufficient_data", reason: "AI가 빈 응답을 반환했습니다." };
  }

  const grounding = stepA.candidates?.[0]?.groundingMetadata;
  const { sources } = buildSourceList(grounding?.groundingChunks);
  const sourceListText = sources.length
    ? sources.map((s) => `${s.n}. ${s.title} — ${s.url}`).join("\n")
    : "(검색된 출처 없음)";

  // 2차: 구조화된 JSON으로 변환 (그라운딩 없이, 포맷 변환만)
  let stepB;
  try {
    stepB = await withGeminiRetry(
      () =>
        ai.models.generateContent({
          model: GEMINI_MODELS.flash,
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `
다음 실행 계획 글을 JSON 스키마에 맞춰 단계별로 구조화해줘.

[원문]
${freeText}

[출처 목록]
${sourceListText}

규칙:
- source_n은 반드시 위 [출처 목록]에 있는 번호만 쓸 것. 새로운 URL이나 번호를 만들어내지 말 것.
- 관련 출처가 없는 단계는 source_n을 0으로 둘 것.
- task는 "오늘 당장 할 일"처럼 구체적인 행동으로 쓸 것.
`.trim(),
                },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: PLAN_SCHEMA,
          },
        }),
      "generatePlan:stepB"
    );
  } catch (err) {
    console.error("[generatePlan] 2차 구조화 재시도 후에도 실패", err);
    return {
      type: "insufficient_data",
      reason: "실행계획을 정리하는 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
    };
  }

  // 생성 소요시간은 개발자 확인용 로그로만 남기고, 화면에는 노출하지 않는다.
  console.log(`[generatePlan] latency_ms=${Date.now() - start}`);

  const raw = stepB.text;
  if (!raw) {
    return { type: "insufficient_data", reason: "실행계획 구조화 응답이 비어 있습니다." };
  }

  const parsed = JSON.parse(raw) as {
    steps: Array<{
      order: number;
      task: string;
      estimated_minutes: number;
      search_keywords: string[];
      source_n: number;
    }>;
  };

  const validatedSources = await validateSources(sources);
  const sourceByN = new Map(validatedSources.map((s) => [s.n, s]));

  return {
    type: "plan",
    steps: parsed.steps.map((s) => ({
      order: s.order,
      task: s.task,
      estimated_minutes: s.estimated_minutes,
      search_keywords: s.search_keywords,
      source_n: sourceByN.has(s.source_n) ? s.source_n : null,
    })),
    sources: validatedSources,
    latency_ms: Date.now() - start,
  };
}
