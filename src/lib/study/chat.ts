import { generate, type LlmPart } from "@/lib/llm";
import { buildSourceList, insertCitationMarkers } from "@/lib/gemini/citations";
import type { SourceRef } from "@/types/task";
import { ANTI_AI_TONE_RULES } from "@/lib/gemini/prompts";
import { dedupeAdjacentMarkers } from "@/lib/gemini/citation-cleanup";
import type { StudyContext } from "./context";

import { sanitizeTurns, type ChatTurn } from "./turns";
export { sanitizeTurns };
export type { ChatTurn };

const SYSTEM = `
너는 한국 고등학생의 수행평가를 곁에서 돕는 AI 조교다.
- [과제 자료]나 학생이 올린 안내문(사진·글)이 주어졌을 때만 그 내용을 기준으로 답하고, 거기에 없는 내용은 "자료에는 없어요"라고 말하며 지어내지 않는다. 그런 자료가 없는 일반 질문에는 자료 얘기를 꺼내지 말고 바로 답한다.
- 사실(날짜·수치·인물·책 정보)을 말할 때는 확실한 것만 말하고, 확인이 필요한 최신·세부 사실은 검색으로 확인한다. 모르면 모른다고 말한다.
- 학생 본인의 경험·감정·생각은 학생이 말해 준 것만 쓴다. 대신 지어내지 않는다.
- 학생이 글쓰기를 요청하면 도와준다. 단, 학생이 그대로 제출할 글에는 아래 문체 규칙을 따른다.
- 답은 한국어로, 요점부터, 짧고 구체적으로 쓴다(대부분 5~8문장 안). 필요할 때만 짧은 목록을 쓰고, 소제목·굵은 글씨·이모지·"체크리스트" 같은 구획은 만들지 않는다.
- 안내문 사진이 주어지면 먼저 무엇을 해야 하는 과제인지(주제·요구사항·분량·제출 조건)를 파악해서 질문에 답한다.
`.trim();

export interface ChatAnswer {
  reply: string;
  sources: SourceRef[];
}

export async function answerChat(params: {
  turns: ChatTurn[];
  image?: { base64: string; mimeType: string } | null;
  context?: StudyContext | null;
  /** 화면 언어(쿠키). en이면 영어로 답한다. */
  lang?: "ko" | "en";
}): Promise<ChatAnswer> {
  const { turns, image, context } = params;
  const lang = params.lang ?? context?.lang ?? "ko";
  const transcript = turns.map((t) => `${t.role === "user" ? "학생" : "AI"}: ${t.content}`).join("\n\n");

  const prompt =
    (context
      ? `[과제 자료 — 제목: ${context.title} / 과목: ${context.subject} / ${context.sourceLabel}]\n${context.text}\n\n`
      : "") +
    `[대화]\n${transcript}\n\n위 대화의 마지막 학생 메시지에 답해줘.\n\n${ANTI_AI_TONE_RULES}`;

  const parts: LlmPart[] = [];
  if (image) parts.push({ image });
  parts.push({ text: prompt });

  const res = await generate({
    label: "study:chat",
    role: "main",
    system: lang === "en" ? `${SYSTEM}\n- 답은 영어로 쓴다(위의 "한국어로"보다 이 지시가 우선). 학생이 다른 언어를 명시하면 그 언어를 따른다.` : SYSTEM,
    prompt: parts,
    // 모델이 필요하다고 판단할 때만 검색한다(강제 아님) — 호출당 비용이 있어 최대 2회.
    search: { force: false, maxCalls: 2 },
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
  return { reply: dedupeAdjacentMarkers(reply), sources: used };
}
