// 대화 입력을 다듬는 순수 함수(alias import 없음 — 테스트에서 바로 불러올 수 있게).
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const MAX_TURNS = 12;
const MAX_TURN_CHARS = 4000;

/** 클라이언트가 보낸 대화를 안전한 형태로 다듬는다(역할·길이·개수 제한, 마지막은 반드시 user). */
export function sanitizeTurns(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns = raw
    .map((t) => {
      const o = t as { role?: unknown; content?: unknown };
      if ((o?.role !== "user" && o?.role !== "assistant") || typeof o.content !== "string") return null;
      const content = o.content.trim().slice(0, MAX_TURN_CHARS);
      return content ? ({ role: o.role, content } as ChatTurn) : null;
    })
    .filter((t): t is ChatTurn => t !== null)
    .slice(-MAX_TURNS);
  while (turns.length > 0 && turns[turns.length - 1].role !== "user") turns.pop();
  return turns;
}

