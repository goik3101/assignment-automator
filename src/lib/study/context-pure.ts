// 서버 라우트와 테스트가 같이 쓰는 순수 함수들(alias import 없음 — node:test에서 바로 불러올 수 있게).
export type StudyContextRef = { kind: "history" | "learning"; id: string };

export const MAX_CONTEXT_CHARS = 14000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseContextRef(raw: unknown): StudyContextRef | null {
  const r = raw as { kind?: unknown; id?: unknown } | null;
  if (!r || typeof r !== "object") return null;
  if ((r.kind !== "history" && r.kind !== "learning") || typeof r.id !== "string" || !UUID.test(r.id)) return null;
  return { kind: r.kind, id: r.id };
}

export function clip(text: string, max = MAX_CONTEXT_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n…(이하 생략)";
}

/** 학습 모드 세션: 항목별 조사 자료 + 학생이 쓴 글을 하나의 텍스트로 묶는다. */
export function learningToText(
  sections: { label: string; research: { content?: string } | null; draft: string }[]
): string {
  return sections
    .map((s) => {
      const parts = [`## ${s.label}`];
      if (s.research?.content) parts.push(`[조사 자료]\n${s.research.content}`);
      if (s.draft?.trim()) parts.push(`[학생이 쓴 글]\n${s.draft.trim()}`);
      return parts.join("\n");
    })
    .join("\n\n");
}
