// AI 채팅의 프롬프트 조립과 응답 해석(alias import 없음 — node:test에서 바로 불러올 수 있게).
import type { ChatTurn } from "./turns.ts";

export const CHAT_SYSTEM = `
너는 한국 고등학생의 수행평가를 곁에서 돕는 AI 조교다.
- [과제 안내]는 학생이 받은 수행평가 안내문을 분석한 것이고, [과제 자료]는 그 과제로 만든 글이나 조사 자료다. 학생이 "이 수행평가", "이 과제"라고 하면 [과제 안내]의 주제와 요구사항을 가리킨다.
- 이 과제에서 알아야 할 개념·용어·배경지식·쓰는 방법을 설명해 달라는 질문이면, [과제 안내]의 주제와 요구사항에 맞춰 아는 범위에서 충분히 설명한다. 이런 질문에 "자료에는 없어요"라고 답하지 않는다.
- "자료에는 없어요"는 [과제 안내]나 [과제 자료]에 적힌 내용 자체를 묻는데 거기에 없을 때(예: 제출 기한, 글에 쓴 문장)만 쓰고, 그때도 지어내지 않는다. 그런 자료가 없는 일반 질문에는 자료 얘기를 꺼내지 말고 바로 답한다.
- 사실(날짜·수치·인물·책 정보)을 말할 때는 확실한 것만 말하고, 확인이 필요한 최신·세부 사실은 검색으로 확인한다. 모르면 모른다고 말한다.
- 학생 본인의 경험·감정·생각은 학생이 말해 준 것만 쓴다. 대신 지어내지 않는다.
- 학생이 글쓰기를 요청하면 도와준다. 단, 학생이 그대로 제출할 글에는 아래 문체 규칙을 따른다.
- 학생에게는 부드러운 존댓말(~해요)로 말한다. 학생이 반말을 써도 따라 하지 않는다. 학생이 제출할 글은 이 말투가 아니라 그 글에 맞는 문체로 쓴다.
- 답은 한국어로, 요점부터, 구체적으로 쓴다. 대부분 5~8문장 안이고, 개념을 풀어 설명해야 할 때는 10문장 안팎까지 쓴다. 필요할 때만 짧은 목록을 쓰고, 소제목·굵은 글씨·이모지·"체크리스트" 같은 구획은 만들지 않는다.
- 안내문 사진이 주어지면 먼저 무엇을 해야 하는 과제인지(주제·요구사항·분량·제출 조건)를 파악해서 질문에 답한다.
`.trim();

/** 검색 없이 먼저 답해 보는 호출에만 덧붙인다 — 검색이 필요한 질문은 답을 비우고 신호만 보내 검색 경로로 넘긴다. */
export const CHAT_ROUTING_RULES = `
- 응답은 JSON이다. 검색이 필요 없으면 needs_search를 false로 하고 answer에 답을 쓴다.
- 최신 정보, 수치·날짜·통계, 인물·책·작품·기관의 세부 사실처럼 틀리기 쉬운 사실을 말해야 하거나 학생이 출처·링크를 달라고 하면 needs_search를 true로 하고 answer는 빈 문자열로 둔다(검색해서 다시 답한다).
- 과제 안내·자료로 답할 수 있는 질문, 일반 개념 설명, 글쓰기 도움, 문장 다듬기, 계획 세우기는 needs_search를 false로 한다.
- 학생이 무언가를 외워야 한다고 하거나 외우는 방법을 묻거나 "외울 수 있게 해줘"처럼 암기를 요청하면 offer_memorize를 true로 한다. 이때 answer에는 한두 문장으로만 반응하고(예: 외워야 할 내용이네요), 외우는 방법은 화면의 버튼(플래시카드·퀴즈·정리)으로 학생이 고르므로 요약이나 문제를 직접 만들어 주지 않는다. 그 밖의 질문은 false로 한다.
`.trim();

export interface ChatPromptContext {
  title: string;
  subject: string;
  sourceLabel: string;
  text: string;
  assignmentInfo?: string;
}

export function buildChatPrompt(p: { context?: ChatPromptContext | null; turns: ChatTurn[]; toneRules: string }): string {
  const { context, turns } = p;
  const transcript = turns.map((t) => `${t.role === "user" ? "학생" : "AI"}: ${t.content}`).join("\n\n");
  const info = context?.assignmentInfo?.trim();
  return (
    (info ? `[과제 안내 — 학생이 받은 수행평가 안내문을 분석한 내용]\n${info}\n\n` : "") +
    (context ? `[과제 자료 — 제목: ${context.title} / 과목: ${context.subject} / ${context.sourceLabel}]\n${context.text}\n\n` : "") +
    `[대화]\n${transcript}\n\n위 대화의 마지막 학생 메시지에 답해줘.\n\n${p.toneRules}`
  );
}

/** 1차 응답이 "암기 방법 고르기"를 권했는지. 저장된 과제가 있을 때만 켠다 — 도구(플래시카드·퀴즈·요약)는 저장된 과제로만 만들 수 있다. */
export function offersMemorize(data: { offer_memorize?: unknown } | null | undefined, hasContext: boolean): boolean {
  return hasContext && data?.offer_memorize === true;
}

/** 검색 없이 먼저 답한 결과를 해석한다. 답이 있고 검색이 필요 없다고 했을 때만 그 답을 쓴다(아니면 null → 검색 경로). */
export function routedAnswer(data: { needs_search?: unknown; answer?: unknown } | null | undefined): string | null {
  if (!data || data.needs_search === true || typeof data.answer !== "string") return null;
  const answer = data.answer.trim();
  return answer || null;
}
