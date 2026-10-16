// 제작 전 질문(수행평가를 만들기 전에 학생에게 꼭 필요한 것만 묻는 단계)의 순수 규칙들.
// alias import 없음 — node:test에서 바로 불러올 수 있다.

export type AiMode = "fast" | "personal";

/** 질문 개수 상한: 빠르게 만들기 최대 2개, 나에게 맞추기 최대 4개. */
export const QUESTION_CAP: Record<AiMode, number> = { fast: 2, personal: 4 };

export function parseMode(v: unknown): AiMode {
  return v === "personal" ? "personal" : "fast";
}

/** kind: "choice" = 과제 방향을 정하는 선택형, "personal" = 학생 본인의 경험·생각·상황(건너뛰고 나중에 직접 쓸 수 있다). */
export interface PreQuestion {
  id: string;
  /** 이 질문이 정하려는 결정의 이름(예: book_title). 같은 결정을 두 번 묻지 않는 데 쓴다. */
  key: string;
  text: string;
  kind: "choice" | "personal";
  options: string[];
  /** 보기 밖의 직접 입력을 허용할지. */
  allowOther: boolean;
  /** 이 질문을 왜 묻는지(학생에게 한 줄로 보여줄 이유). */
  why: string;
}

export interface PreAnswer {
  question: string;
  /** 질문의 decision key(있으면 같은 결정 재질문을 막는다). */
  key?: string;
  /** 학생이 고른/쓴 답. */
  answer: string;
  /** "later" = 나중에 직접 쓸게요, "delegate" = AI가 정해 주세요, "answered" = 직접 답함. */
  state: "answered" | "later" | "delegate";
}

// 화면이 항상 따로 주는 선택지(직접 입력·AI에게 맡김)를 모델이 보기에 또 넣으면 뺀다.
const GENERIC_OPTION = /^(직접|기타|다른)\s*(입력|적기|인물|책|작성)|직접\s*(입력|적)|AI\s*(에게|가)\s*(맡|알아서|대신|정해)|상관\s*없|아무거나/;

// AI가 개인 내용을 어떻게 처리할지를 학생에게 묻는 질문은 서비스 규칙으로 이미 정해져 있어 묻지 않는다(정보가 없으면 학생이 직접 채울 빈칸으로 남긴다).
const META_HANDLING = /AI가?\s*(일반|대신|학생\s*관점|알아서\s*(작성|써))|대신\s*(작성|써)|빈칸/;

const norm = (s: string) => s.replace(/[\s?？!.,~·'"“”‘’]/g, "").toLowerCase();

/** 모델이 준 후보 질문을 화면에 보여도 되는 형태로 다듬는다. 쓸 수 없으면 null(=더 묻지 않는다). */
export function sanitizeQuestion(raw: unknown, asked: PreAnswer[]): PreQuestion | null {
  const q = raw as { text?: unknown; kind?: unknown; options?: unknown; allow_other?: unknown; why?: unknown; decision_key?: unknown } | null;
  if (!q || typeof q.text !== "string") return null;
  const text = q.text.trim();
  if (text.length < 4 || text.length > 140) return null;
  const kind = q.kind === "personal" ? "personal" : "choice";
  const seen = new Set<string>();
  const options = (Array.isArray(q.options) ? q.options : [])
    .map((o) => (typeof o === "string" ? o.trim() : ""))
    .filter((o) => {
      const k = norm(o);
      if (!o || o.length > 60 || GENERIC_OPTION.test(o) || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 5);
  // 선택형은 보기가 2개 이상이어야 한다. 개인형은 보기 없이 직접 쓰기만 받을 수도 있다.
  if (kind === "choice" && options.length < 2) return null;
  if (META_HANDLING.test([text, ...options].join(" "))) return null;
  // 같은 결정을 다시 묻지 않는다(decision key가 같거나, 질문 문장이 거의 같으면 끝낸다).
  const key = typeof q.decision_key === "string" ? q.decision_key.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40) : "";
  if (key && asked.some((a) => a.key === key)) return null;
  const t = norm(text);
  if (asked.some((a) => norm(a.question) === t || (t.length > 8 && (norm(a.question).includes(t) || t.includes(norm(a.question)))))) return null;
  return {
    id: `q${asked.length + 1}`,
    key: key || `q${asked.length + 1}`,
    text,
    kind,
    options,
    allowOther: kind === "personal" ? true : q.allow_other === true,
    why: typeof q.why === "string" ? q.why.trim().slice(0, 100) : "",
  };
}

/** 학생의 답을 생성 프롬프트에 붙일 지침 문단으로 바꾼다. 답하지 않은 개인 내용은 지어내지 않게 못박는다. */
export function answersToInstructions(answers: PreAnswer[]): string {
  if (answers.length === 0) return "";
  const lines = answers.map((a) => {
    if (a.state === "later")
      return `- 질문: ${a.question}\n  답: (학생이 나중에 직접 쓰겠다고 함) → 이 부분은 지어내지 말고, 학생이 직접 채울 자리를 "[직접 작성: 무엇]" 형태의 빈칸으로 남길 것.`;
    if (a.state === "delegate") return `- 질문: ${a.question}\n  답: (학생이 AI에게 맡김) → 과제 조건에 맞게 합리적으로 정하되, 학생 본인의 경험·감정은 지어내지 말 것.`;
    return `- 질문: ${a.question}\n  답: ${a.answer}`;
  });
  return `[학생이 제작 전에 답한 내용 — 아래 답은 그대로 반영하고, 답에 없는 학생의 개인 경험·생각은 지어내지 말 것]\n${lines.join("\n")}`;
}

/** 기존 지침(학생이 직접 쓴 상세 입력)과 질문 답변을 합친다. 합친 길이가 너무 길어지지 않게 자른다. */
export function mergeInstructions(base: string, answers: PreAnswer[], max = 4800): string {
  const add = answersToInstructions(answers);
  const joined = [base.trim(), add].filter(Boolean).join("\n\n");
  return joined.length > max ? joined.slice(0, max) : joined;
}

/** 입력으로 받은 이전 답변 배열을 안전하게 다듬는다(개수·길이·상태). */
export function sanitizeAnswers(raw: unknown, cap: number): PreAnswer[] {
  if (!Array.isArray(raw)) return [];
  const out: PreAnswer[] = [];
  for (const a of raw.slice(0, cap)) {
    const o = a as { question?: unknown; answer?: unknown; state?: unknown; key?: unknown };
    if (typeof o?.question !== "string" || !o.question.trim()) continue;
    const state = o.state === "later" || o.state === "delegate" ? o.state : "answered";
    const answer = typeof o.answer === "string" ? o.answer.trim().slice(0, 500) : "";
    if (state === "answered" && !answer) continue;
    out.push({ question: o.question.trim().slice(0, 200), answer, state, key: typeof o.key === "string" ? o.key.slice(0, 40) : undefined });
  }
  return out;
}
