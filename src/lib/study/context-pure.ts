// 서버 라우트와 테스트가 같이 쓰는 순수 함수들(alias import 없음 — node:test에서 바로 불러올 수 있게).
/** history = user_histories.id, submission = 생성 직후 받는 submissionId(user_histories.submission_id), learning = 학습 세션 id, tutor = AI 튜터 대화 id */
export type StudyContextRef = { kind: "history" | "learning" | "submission" | "tutor"; id: string };

export const MAX_CONTEXT_CHARS = 14000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 라우트가 id를 DB에 넘기기 전에 형식부터 거른다. */
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

export function parseContextRef(raw: unknown): StudyContextRef | null {
  const r = raw as { kind?: unknown; id?: unknown } | null;
  if (!r || typeof r !== "object") return null;
  if ((r.kind !== "history" && r.kind !== "learning" && r.kind !== "submission" && r.kind !== "tutor") || !isUuid(r.id)) return null;
  return { kind: r.kind, id: r.id };
}

export function clip(text: string, max = MAX_CONTEXT_CHARS): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n…(이하 생략)";
}

const ASSIGNMENT_INFO_MAX = 3000;

/**
 * 채팅이 "이 수행평가가 뭘 하라는 과제인지" 알도록 안내문 분석 결과(core_task_info)를 읽기 쉬운 글로 바꾼다.
 * 제출기한·배점 같은 행정정보(admin_info)는 일부러 넣지 않는다. 값이 비었거나 모양이 달라도 던지지 않고 빈 문자열을 돌려준다.
 */
export function assignmentInfoToText(core: unknown, instructions?: string | null): string {
  const c = (core && typeof core === "object" ? core : {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.map(s).filter(Boolean) : []);
  const lines: string[] = [];
  if (s(c.topic)) lines.push(`주제: ${s(c.topic)}`);
  const reqs = list(c.requirements);
  if (reqs.length) lines.push(`요구사항:\n${reqs.map((r) => `- ${r}`).join("\n")}`);
  const elements = Array.isArray(c.task_elements) ? (c.task_elements as Record<string, unknown>[]) : [];
  const els = elements
    .map((e) => {
      if (!e || typeof e !== "object" || !s(e.label)) return "";
      const len = e.target_length as { min?: unknown; max?: unknown; unit?: unknown } | undefined;
      const unit = len?.unit === "words" ? "단어" : "자";
      const size = len && Number.isFinite(Number(len.min)) && Number.isFinite(Number(len.max)) ? ` (분량 ${len.min}~${len.max}${unit})` : "";
      const items = list(e.required_items);
      return `- ${s(e.label)}${size}${s(e.description) ? `: ${s(e.description)}` : ""}${items.length ? `\n  필수 항목: ${items.join(", ")}` : ""}`;
    })
    .filter(Boolean);
  if (els.length) lines.push(`해야 할 일:\n${els.join("\n")}`);
  if (s(c.writing_guide)) lines.push(`작성 기준(안내문의 채점표·양식·예시에서 뽑은 것):\n${s(c.writing_guide)}`);
  if (s(instructions)) lines.push(`학생이 이번 과제에 덧붙인 요청: ${s(instructions)}`);
  return clip(lines.join("\n"), ASSIGNMENT_INFO_MAX);
}

/**
 * AI 튜터 대화를 학습 도구(요약·플래시카드·퀴즈·가상 시험)의 자료로 바꾼다. 글이 가장 최근에 쓰이는 경우가 많아서
 * 길면 앞이 아니라 오래된 대화부터 버린다. AI가 쓴 글이 하나도 없으면 빈 문자열(= 아직 공부할 내용이 없음).
 */
export function tutorToText(messages: { role: string; content: string; attachment_text?: string | null }[], max = MAX_CONTEXT_CHARS): string {
  if (!messages.some((m) => m.role === "assistant" && m.content.trim())) return "";
  const blocks = messages.map((m) => {
    const att = m.role === "user" && m.attachment_text?.trim() ? `\n(학생이 올린 사진의 글)\n${m.attachment_text.trim()}` : "";
    return `${m.role === "user" ? "학생" : "AI 튜터"}: ${m.content.trim()}${att}`;
  });
  const kept: string[] = [];
  let used = 0;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (used + blocks[i].length > max && kept.length > 0) break;
    kept.unshift(blocks[i].length > max ? blocks[i].slice(0, max) : blocks[i]);
    used += blocks[i].length + 2;
  }
  return kept.join("\n\n");
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
