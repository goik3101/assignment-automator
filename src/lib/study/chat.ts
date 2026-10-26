import { Type, type Schema } from "@google/genai";
import { generate, generateJson, type LlmPart } from "@/lib/llm";
import { buildSourceList, insertCitationMarkers } from "@/lib/gemini/citations";
import type { SourceRef } from "@/types/task";
import { ANTI_AI_TONE_RULES } from "@/lib/gemini/prompts";
import { dedupeAdjacentMarkers } from "@/lib/gemini/citation-cleanup";
import type { StudyContext } from "./context";
import { buildChatPrompt, CHAT_ROUTING_RULES, CHAT_SYSTEM, offersMemorize, routedAnswer } from "./chat-pure";

import { sanitizeTurns, type ChatTurn } from "./turns";
export { sanitizeTurns };
export type { ChatTurn };

export interface ChatAnswer {
  reply: string;
  sources: SourceRef[];
  /** true면 화면이 답변 아래에 "어떤 방법으로 외워 볼까요?"(플래시카드·퀴즈·정리) 버튼을 보여준다. 저장된 과제에서만 켠다. */
  offerMemorize?: boolean;
}

const ROUTED_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    needs_search: { type: Type.BOOLEAN, description: "웹 검색으로 확인해야 답할 수 있으면 true" },
    answer: { type: Type.STRING, description: "needs_search가 false일 때 학생에게 보낼 답. true면 빈 문자열" },
    offer_memorize: { type: Type.BOOLEAN, description: "학생이 무언가를 외워야 한다고 하거나 암기를 요청했으면 true" },
  },
  required: ["needs_search", "answer", "offer_memorize"],
};

export async function answerChat(params: {
  turns: ChatTurn[];
  image?: { base64: string; mimeType: string } | null;
  context?: StudyContext | null;
  /** 화면 언어(쿠키). en이면 영어로 답한다. */
  lang?: "ko" | "en";
}): Promise<ChatAnswer> {
  const { turns, image, context } = params;
  const lang = params.lang ?? context?.lang ?? "ko";

  const prompt = buildChatPrompt({ context, turns, toneRules: ANTI_AI_TONE_RULES });
  const parts: LlmPart[] = [];
  if (image) parts.push({ image });
  parts.push({ text: prompt });
  const system = lang === "en" ? `${CHAT_SYSTEM}\n- 답은 영어로 쓴다(위의 "한국어로"보다 이 지시가 우선). 학생이 다른 언어를 명시하면 그 언어를 따른다.` : CHAT_SYSTEM;

  // 값싼 모델(공부 도구용)이 먼저 검색 없이 답해 보고, 검색이 필요하다고 하면 검색 가능한 main 모델로 다시 답한다.
  // CHAT_ROUTING=off면 예전처럼 main 모델 한 번(검색은 모델이 판단)으로 되돌린다. 먼저 한 호출이 실패해도 검색 경로로 이어서 답한다.
  let forceSearch = false;
  let offerMemorize = false;
  if (process.env.CHAT_ROUTING !== "off") {
    try {
      const { data } = await generateJson<{ needs_search?: boolean; answer?: string; offer_memorize?: boolean }>({
        label: "study:chat",
        role: "study",
        system: `${system}\n${CHAT_ROUTING_RULES}`,
        prompt: parts,
        schema: ROUTED_SCHEMA,
        effort: "low",
        maxOutputTokens: 4000,
      });
      offerMemorize = offersMemorize(data, !!context);
      const direct = routedAnswer(data);
      if (direct) return { reply: direct, sources: [], ...(offerMemorize ? { offerMemorize } : {}) };
      // 1차 모델이 "검색해야 한다"고 판단했으면 2차에서 검색을 건너뛰지 못하게 강제한다(안 그러면 검색 요금만 아끼고 출처 없는 답이 나올 수 있다).
      forceSearch = data?.needs_search === true;
    } catch (err) {
      console.warn("[study:chat] 검색 없는 1차 답변 실패 — 검색 경로로 이어서 답합니다", err instanceof Error ? err.name : "unknown");
    }
  }

  const res = await generate({
    label: "study:chatSearch",
    role: "main",
    system,
    prompt: parts,
    // 1차에서 검색이 필요하다고 한 경우만 강제, 그 밖에는 모델이 필요하다고 판단할 때만 검색한다 — 호출당 비용이 있어 최대 2회.
    search: { force: forceSearch, maxCalls: 2 },
    effort: "low",
    maxOutputTokens: 4000,
  });

  const text = res.text.trim();
  if (!text) throw new Error("빈 응답");
  // 링크로 렌더링되는 값이라 http(s)만 받는다(javascript: 같은 주소가 섞여 들어와도 화면에 나가지 않게).
  const safeChunks = (res.grounding?.chunks ?? []).map((c) => (c.web?.uri && /^https?:\/\//i.test(c.web.uri) ? c : {}));
  const { sources, chunkIndexToN } = buildSourceList(safeChunks);
  const annotated = insertCitationMarkers(text, res.grounding?.supports, chunkIndexToN).trim();
  // 실제로 본문에 인용된 출처만 남기고, 등장 순서대로 1번부터 다시 매긴다.
  const order = new Map<number, number>();
  const reply = annotated.replace(/\[(\d+)\]/g, (_m, n: string) => {
    const old = Number(n);
    if (!sources.some((s) => s.n === old)) return "";
    if (!order.has(old)) order.set(old, order.size + 1);
    return `[${order.get(old)}]`;
  });
  const used = [...order.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([old, n]) => ({ ...sources.find((s) => s.n === old)!, n }));
  return { reply: dedupeAdjacentMarkers(reply), sources: used, ...(offerMemorize ? { offerMemorize } : {}) };
}
