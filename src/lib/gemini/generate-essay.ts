import { getGeminiClient, GEMINI_MODELS } from "./client";
import {
  ANTI_AI_TONE_RULES,
  COPYRIGHT_RULES,
  NO_META_COMMENTARY_RULE,
  CITATION_JUDGMENT_RULE,
  PERSPECTIVE_RULE,
  MULTI_DELIVERABLE_SEPARATION_RULE,
} from "./prompts";
import { buildSourceList, insertCitationMarkers } from "./citations";
import { validateSources } from "@/lib/links/validate-sources";
import { withGeminiRetry } from "./retry";
import type { CoreTaskInfo, EssayResult, InsufficientDataResult } from "@/types/task";

// 기획서 5-1: 완성 원고 경로는 그라운딩 켠 상태로 마크다운을 바로 받는다.
// (계획서 경로처럼 2차 JSON 변환을 거치지 않아도 돼서 더 빠르다.)
//
// M1 구현 노트: Gemini의 groundingSupports는 "완성된 응답 전체"에 대해서만
// 정확한 바이트 오프셋을 주기 때문에, 토큰 단위 스트리밍 대신 한 번에 전체
// 응답을 받아 각주를 정확히 삽입하는 방식을 택했다. (출처 정확성이 겹침방지·
// 신뢰성이라는 이 서비스의 핵심 가치이므로, 속도보다 정확도를 우선함)
// 실측 결과 지연이 크면, 이후 "텍스트는 즉시 스트리밍 + 각주는 완료 후 붙이기"
// 같은 절충안으로 바꿀 수 있다 — 그때까지는 이 구조를 유지한다.

export interface GenerateEssayInput {
  subject: string;
  coreTaskInfo: CoreTaskInfo;
  /** F1~F2에서 학생이 입력한 지침 */
  instructions?: string;
  /** M2에서 클러스터 겹침 방지 로직이 채워 넣을 회피 지시. M1에서는 항상 비어있다. */
  avoidanceInstruction?: string;
  /** 설정 탭 개인화 정보 (M4 이후 연동) */
  personalization?: string;
  /** F6 재생성 시 학생이 입력하는 "이번엔 이렇게 고쳐줘" 방향 (9-5) */
  revisionInstructions?: string;
  /**
   * F6 재생성 시 이전 버전의 실제 결과 텍스트. 이게 있으면 인물 이름·구체적
   * 에피소드·처방한 책 같은 "이미 정해진 사실"을 재생성마다 새로 지어내지
   * 않고 그대로 이어가라고 프롬프트에서 강하게 지시한다.
   */
  previousOutputText?: string;
}

function buildPrompt(input: GenerateEssayInput): string {
  const element = input.coreTaskInfo.task_elements.find(
    (e) => e.type === "text_submission"
  );

  // F6 재생성: 이전 버전이 있으면 프롬프트 맨 위에 "이미 정해진 사실은 절대
  // 바꾸지 마라"를 강하게 박아 넣는다 — 안 그러면 재생성마다 인물 이름·에피소드·
  // 처방한 책 같은 구체적 내용이 매번 새로 지어져서 하나의 결과물로 이어지지 않는다.
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
${continuityBlock}너는 한국 고등학생이 수행평가로 제출할 글을 대신 써주는 도우미다.
아래 정보를 바탕으로, 학생이 그대로 제출해도 될 만큼 완성도 있는 원고를 작성하라.

[과목] ${input.subject}
[과제 주제] ${input.coreTaskInfo.topic}
[요구사항]
${input.coreTaskInfo.requirements.map((r) => `- ${r}`).join("\n") || "(명시된 요구사항 없음)"}
[이 요소에 대한 설명] ${element?.description ?? ""}
${input.instructions ? `[학생이 추가로 입력한 지침]\n${input.instructions}` : ""}
${input.avoidanceInstruction ? `[다양성 확보를 위한 회피 지시 — 반드시 반영할 것]\n${input.avoidanceInstruction}` : ""}
${input.personalization ? `[학생 개인화 정보 — 자연스럽게 녹여낼 것]\n${input.personalization}` : ""}
${input.revisionInstructions ? `[재생성 요청 — 학생이 이전 결과물에 만족하지 못해 다시 요청함. 아래 방향을 반드시 반영해 새로 작성할 것]\n${input.revisionInstructions}` : ""}

작성 규칙:
1. 구체적 사실(책 줄거리, 역사적 사건, 통계 등)이 필요하면 반드시 실시간 검색으로 확인한 뒤 쓸 것.
   검색으로도 확인이 안 되는 핵심 사실이 있으면, 지어내지 말고 본문 맨 앞에
   "[자료부족: 이유]" 형태로 한 줄만 표시할 것.
2. 맨 위에 불릿 3줄로 이 글의 내용을 요약해서 먼저 제시할 것 (학생이 스스로 검증할
   수 있도록 — 글의 "내용"만 요약하고, 어떻게 썼는지에 대한 언급은 절대 넣지 말 것).
3. 그 요약 바로 다음 줄부터 구분선이나 "본문" 같은 라벨 없이 곧바로 본문을 이어서 쓸 것.
${ANTI_AI_TONE_RULES}
${COPYRIGHT_RULES}
${NO_META_COMMENTARY_RULE}
${CITATION_JUDGMENT_RULE}
${PERSPECTIVE_RULE}
${MULTI_DELIVERABLE_SEPARATION_RULE}
`.trim();
}

export async function generateEssay(
  input: GenerateEssayInput
): Promise<EssayResult | InsufficientDataResult> {
  const start = Date.now();
  const ai = getGeminiClient();

  const prompt = buildPrompt(input);
  // 실제로 어떤 컨텍스트가 모델에 들어가는지 확인용 (요청 원인 진단용 로그).
  console.log("[generateEssay] prompt:\n" + prompt);

  let response;
  try {
    response = await withGeminiRetry(
      () =>
        ai.models.generateContent({
          model: GEMINI_MODELS.flash,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: { tools: [{ googleSearch: {} }] },
        }),
      "generateEssay"
    );
  } catch (err) {
    console.error("[generateEssay] 재시도 후에도 실패", err);
    return {
      type: "insufficient_data",
      reason: "지금 검색 서비스가 불안정해서 원고를 만들지 못했어요. 잠시 후 다시 시도해주세요.",
    };
  }

  // 생성 소요시간은 개발자 확인용 로그로만 남기고, 화면에는 노출하지 않는다.
  console.log(`[generateEssay] latency_ms=${Date.now() - start}`);

  const text = response.text;
  if (!text) {
    return { type: "insufficient_data", reason: "AI가 빈 응답을 반환했습니다." };
  }

  if (text.trimStart().startsWith("[자료부족")) {
    const match = text.match(/\[자료부족:?\s*(.*?)\]/);
    return { type: "insufficient_data", reason: match?.[1] || "자료가 부족합니다." };
  }

  const candidate = response.candidates?.[0];
  const grounding = candidate?.groundingMetadata;
  const { sources, chunkIndexToN } = buildSourceList(grounding?.groundingChunks);
  const annotated = insertCitationMarkers(text, grounding?.groundingSupports, chunkIndexToN);
  const validatedSources = await validateSources(sources);

  return {
    type: "essay",
    markdown: annotated,
    sources: validatedSources,
    latency_ms: Date.now() - start,
  };
}
