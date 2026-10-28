// AI 튜터의 프롬프트 조립과 입력·응답 정리(alias import 없음 — node:test에서 바로 불러올 수 있게).

/** 최근 몇 개의 대화를 모델에 다시 보낼지, 한 대화에서 AI가 되물을 수 있는 횟수(최근 대화 기준). 상한은 모델이 아니라 코드가 강제한다. */
export const TUTOR_HISTORY_TURNS = 12;
export const TUTOR_QUESTION_CAP = 3;
const TURN_CHARS = 6000;

export interface TutorQuestion {
  text: string;
  options: string[];
  allowOther: boolean;
}

export interface TutorTurn {
  role: "user" | "assistant";
  content: string;
  /** 학생이 올린 사진에 적힌 글(AI가 옮겨 적은 것). 사진 자체는 다시 보내지 않는다. */
  attachmentText?: string | null;
}

export const TUTOR_SYSTEM = `
너는 한국 고등학생의 수행평가를 곁에서 돕는 AI 튜터다. 학생은 수행평가 시간에 안내문 사진을 못 찍어서 글로 설명하기도 한다. 학생이 설명한 내용이나 올린 사진을 그 수행평가의 안내문으로 보고 그에 맞춰 돕는다.
- 학생이 글쓰기·개요·근거·아이디어·문장 다듬기를 요청하면 말로만 안내하지 말고 바로 써 준다.
- 요청이 충분히 구체적이면 묻지 않고 바로 쓴다. 주제·인물·작품 선택처럼 결과가 크게 달라지는 정보가 비어 있을 때만, 한 번에 질문 하나만 question에 담는다. 학생이 이미 말한 것은 다시 묻지 않는다. 질문을 담을 때 answer에는 한 문장 안내만 쓰고 질문 자체를 되풀이하지 않는다.
- 질문의 보기는 서로 다른 2~5개를 짧게 쓰고, 질문에 바로 답이 되는 보기여야 한다. 책 제목·인물 이름처럼 학생만 아는 정보를 묻는 질문은 보기를 빈 배열로 두고 직접 입력하게 한다. 학생 본인의 경험·감정을 묻는 질문에는 "나중에 직접 쓸게요" 보기를 넣는다.
- 학생 본인의 경험·감정·생각은 학생이 말해 준 것만 쓴다. 대신 지어내지 말고 그 자리는 "(여기에 직접 겪은 일을 쓰세요)"처럼 빈칸으로 남긴다.
- 사실(날짜·수치·인물·책 정보)은 확실한 것만 쓰고, 확인이 필요한 최신·세부 사실은 검색으로 확인한다. 모르면 모른다고 말한다.
- 학생이 그대로 제출할 글은 아래 문체 규칙을 따른다. 학생에게 말할 때는 부드러운 존댓말(~해요)로 하고, 학생이 반말을 써도 따라 하지 않는다.
- 근거 목록이나 개요처럼 구조가 있는 답은 번호 목록을 쓴다. 소제목·굵은 글씨·이모지는 꼭 필요할 때만 쓴다. 답은 요청에 필요한 만큼만 쓰고 군더더기 인사말은 붙이지 않는다.
- 학생이 무언가를 외워야 한다고 하면 먼저 외우기 좋게 간단히 정리해 주고, 화면 오른쪽 "공부 도구"(요약·플래시카드·퀴즈·가상 시험)를 쓰면 더 잘 외울 수 있다고 한 문장으로 알려 준다.
- 학생이 사진을 올렸으면 먼저 무엇을 해야 하는 과제인지(주제·요구사항·분량·제출 조건)를 파악해서 답한다.
`.trim();

/** 검색 없이 먼저 답해 보는 호출에만 덧붙인다 — 검색이 필요한 요청은 답을 비우고 신호만 보내 검색 경로로 넘긴다. */
export const TUTOR_ROUTING_RULES = `
- 응답은 JSON이다. 검색이 필요 없으면 needs_search를 false로 하고 answer에 답을 쓴다.
- 최신 정보, 수치·날짜·통계, 인물·책·작품·기관의 세부 사실을 글에 써야 하거나 학생이 출처·링크를 달라고 하면 needs_search를 true로 하고 answer는 빈 문자열로 둔다(검색해서 다시 답한다).
- 학생이 말한 내용으로 쓸 수 있는 글, 일반 개념 설명, 개요·구성 짜기, 문장 다듬기, 계획 세우기는 needs_search를 false로 한다.
- 학생이 사진을 올렸으면 image_text에 사진에 적힌 글을 가능한 그대로 옮겨 적는다. 사진이 없으면 빈 문자열이다.
`.trim();

function clip(s: string, n = TURN_CHARS): string {
  return s.length <= n ? s : s.slice(0, n) + "\n…(이하 생략)";
}

export function buildTutorPrompt(p: { turns: TutorTurn[]; toneRules: string; questionsLeft: number }): string {
  const transcript = p.turns
    .map((t) => {
      const att = t.role === "user" && t.attachmentText?.trim() ? `\n[학생이 올린 사진의 글]\n${clip(t.attachmentText.trim(), 3000)}` : "";
      return `${t.role === "user" ? "학생" : "AI"}: ${clip(t.content)}${att}`;
    })
    .join("\n\n");
  const ask = p.questionsLeft > 0 ? `필요하면 학생에게 되물을 수 있다(앞으로 ${p.questionsLeft}번까지).` : "이제 더 묻지 말고 지금 있는 정보로 바로 쓴다.";
  return `[대화]\n${transcript}\n\n위 대화의 마지막 학생 메시지에 답해줘. ${ask}\n\n${p.toneRules}`;
}

/** 대화 목록 제목: 첫 메시지의 첫 줄을 잘라 쓴다. */
export function titleFromMessage(text: string, max = 36): string {
  const first = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  const t = first.replace(/\s+/g, " ");
  return t.length <= max ? t || "새 대화" : t.slice(0, max).trimEnd() + "…";
}

/** 모델이 준 질문을 화면에 보여줘도 되는 모양으로 정리한다. 질문이 비었거나 보기가 없으면 null. */
export function sanitizeTutorQuestion(raw: unknown): TutorQuestion | null {
  const q = raw as { text?: unknown; options?: unknown; allow_other?: unknown; allowOther?: unknown } | null;
  if (!q || typeof q !== "object" || typeof q.text !== "string") return null;
  const text = q.text.trim().slice(0, 200);
  if (!text) return null;
  const seen = new Set<string>();
  const options = (Array.isArray(q.options) ? q.options : [])
    .filter((o): o is string => typeof o === "string")
    .map((o) => o.trim().slice(0, 80))
    .filter((o) => {
      if (!o || seen.has(o)) return false;
      seen.add(o);
      return true;
    })
    .slice(0, 5);
  // 보기가 없는 질문은 직접 입력만 받는다. 보기가 하나뿐이면 고르는 의미가 없어 보기를 버린다.
  return { text, options: options.length >= 2 ? options : [], allowOther: (q.allow_other ?? q.allowOther) !== false };
}

/** DB에 저장된 question(jsonb)을 다시 읽을 때 쓴다. */
export function questionFromStored(raw: unknown): TutorQuestion | null {
  const q = raw as { text?: unknown; options?: unknown; allowOther?: unknown } | null;
  return sanitizeTutorQuestion(q && typeof q === "object" ? { ...q, allow_other: q.allowOther } : null);
}

/** 최근 대화에서 AI가 이미 되물은 횟수로 남은 질문 횟수를 센다. */
export function questionsLeft(recent: { role: string; question?: unknown }[]): number {
  const asked = recent.filter((m) => m.role === "assistant" && m.question != null).length;
  return Math.max(0, TUTOR_QUESTION_CAP - asked);
}
