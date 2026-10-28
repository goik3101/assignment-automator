import { Type, type Schema } from "@google/genai";
import { generate, generateJson, type LlmPart } from "@/lib/llm";
import { buildSourceList, insertCitationMarkers } from "@/lib/gemini/citations";
import { ANTI_AI_TONE_RULES, COPYRIGHT_RULES, FACTUAL_RIGOR_RULES, FORM_FIDELITY_RULES } from "@/lib/gemini/prompts";
import { dedupeAdjacentMarkers } from "@/lib/gemini/citation-cleanup";
import type { SourceRef } from "@/types/task";
import { buildTutorPrompt, decideTutorRoute, TUTOR_ROUTING_RULES, TUTOR_SYSTEM, TUTOR_WRITING_RULES, type TutorQuestion, type TutorTurn } from "./tutor-pure";

/** 글쓰기 호출의 추론 강도 — 메인 원고 쓰기(ESSAY_WRITE_EFFORT)와 같은 설정을 따른다. */
function writeEffort(): "minimal" | "low" {
  return process.env.ESSAY_WRITE_EFFORT === "low" ? "low" : "minimal";
}

export interface TutorAnswer {
  reply: string;
  sources: SourceRef[];
  question: TutorQuestion | null;
  /** 이번 메시지에 사진이 있었다면 그 사진에 적힌 글(AI가 옮겨 적은 것). 다음 턴부터 사진 대신 이 글을 쓴다. */
  imageText: string;
}

// 남은 질문 횟수가 0이면 question 자리를 스키마에서 아예 뺀다 — 횟수 상한을 모델 말에 맡기지 않고 코드가 강제한다.
function routedSchema(canAsk: boolean): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      needs_search: { type: Type.BOOLEAN, description: "웹 검색으로 확인해야 답할 수 있으면 true" },
      needs_writing: { type: Type.BOOLEAN, description: "수행평가·과제에 낼 글(근거·개요·초안·본문)을 새로 쓰거나 학생 글을 고쳐 써야 하면 true" },
      answer: { type: Type.STRING, description: "needs_search·needs_writing이 모두 false일 때 학생에게 보낼 답. 하나라도 true면 빈 문자열" },
      image_text: { type: Type.STRING, description: "학생이 올린 사진에 적힌 글을 가능한 그대로 옮긴 것. 사진이 없으면 빈 문자열" },
      ...(canAsk
        ? {
            question: {
              type: Type.OBJECT,
              nullable: true,
              description: "결과가 크게 달라지는 정보가 비었을 때만. 아니면 null.",
              properties: {
                text: { type: Type.STRING, description: "학생에게 보여줄 질문(60자 안팎, 존댓말)" },
                options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "서로 다른 보기 2~5개(짧게). 학생만 아는 정보를 묻는 질문이면 빈 배열" },
                allow_other: { type: Type.BOOLEAN, description: "보기 밖의 직접 입력을 허용할지" },
              },
              required: ["text", "options", "allow_other"],
            } as Schema,
          }
        : {}),
    },
    required: ["needs_search", "needs_writing", "answer", "image_text", ...(canAsk ? ["question"] : [])],
  };
}

export async function answerTutor(params: {
  turns: TutorTurn[];
  image?: { base64: string; mimeType: string } | null;
  lang?: "ko" | "en";
  questionsLeft: number;
}): Promise<TutorAnswer> {
  const { turns, image } = params;
  const prompt = buildTutorPrompt({ turns, toneRules: ANTI_AI_TONE_RULES, questionsLeft: params.questionsLeft });
  const parts: LlmPart[] = [];
  if (image) parts.push({ image });
  parts.push({ text: prompt });
  const system = params.lang === "en" ? `${TUTOR_SYSTEM}\n- 답은 영어로 쓴다(위의 "존댓말" 지시보다 이 지시가 우선). 학생이 다른 언어를 명시하면 그 언어를 따른다.` : TUTOR_SYSTEM;

  // 값싼 공부 도구용 모델이 먼저 보고 일반 질문·개념 설명·안내문 분석·되묻기는 그대로 답한다. 수행평가 글쓰기는 메인에서 원고를 쓰는 모델(write)로,
  // 검색이 필요한 질문은 검색 가능한 main 모델로 넘긴다. 사진은 이 첫 호출에서만 보낸다 — 거기서 옮겨 적은 글을 저장해 두고 이후 턴에는 글만 쓴다.
  // TUTOR_WRITE_ROUTING=off면 글쓰기도 첫 모델이 쓴다(예전 방식).
  let imageText = "";
  let writing = false;
  let search = false;
  try {
    const { data } = await generateJson<{ needs_search?: boolean; needs_writing?: boolean; answer?: string; image_text?: string; question?: unknown }>({
      label: "tutor",
      role: "study",
      system: `${system}\n${TUTOR_ROUTING_RULES}`,
      prompt: parts,
      schema: routedSchema(params.questionsLeft > 0),
      effort: "low",
      maxOutputTokens: 6000,
    });
    imageText = typeof data.image_text === "string" ? data.image_text.trim().slice(0, 6000) : "";
    const route = decideTutorRoute(data, params.questionsLeft > 0, process.env.TUTOR_WRITE_ROUTING !== "off");
    if (route.mode === "direct") return { reply: route.answer, sources: [], question: route.question, imageText };
    writing = route.writing;
    search = route.search;
  } catch (err) {
    console.warn("[tutor] 1차 판단 실패 — main 모델로 이어서 답합니다", err instanceof Error ? err.name : "unknown");
  }

  // 2차: 사진 글을 이미 옮겨 적었으면 사진을 다시 보내지 않는다.
  const searchTurns = imageText && turns.length > 0 ? turns.map((t, i) => (i === turns.length - 1 && t.role === "user" ? { ...t, attachmentText: imageText } : t)) : turns;
  const searchParts: LlmPart[] =
    imageText || !image ? [{ text: buildTutorPrompt({ turns: searchTurns, toneRules: ANTI_AI_TONE_RULES, questionsLeft: 0 }) }] : parts;
  const res = await generate({
    label: writing ? "tutor:write" : "tutor:search",
    role: writing ? "write" : "main",
    // 글쓰기에는 메인 원고 생성과 같은 품질 규칙(양식 따르기·사실 서술·저작권)을 더한다.
    system: writing ? `${system}\n\n${TUTOR_WRITING_RULES}\n\n${FORM_FIDELITY_RULES}\n\n${FACTUAL_RIGOR_RULES}\n\n${COPYRIGHT_RULES}` : system,
    prompt: searchParts,
    // 검색이 필요하다고 한 경우만 검색(강제). 글쓰기만이면 검색 없이 쓰고(메인 원고 쓰기와 같게), 그 밖의 폴백은 모델 판단에 맡긴다 — 최대 2회.
    ...(search || !writing ? { search: { force: search, maxCalls: 2 } } : {}),
    effort: writing && !search ? writeEffort() : "low",
    maxOutputTokens: 6000,
  });
  const text = res.text.trim();
  if (!text) throw new Error("빈 응답");
  // 링크로 렌더링되는 값이라 http(s)만 받는다.
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
  return { reply: dedupeAdjacentMarkers(reply), sources: used, question: null, imageText };
}
