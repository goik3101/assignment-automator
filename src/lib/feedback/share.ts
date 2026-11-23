// "STUDED AI 개선 돕기": 학생이 직접 눌러 안내문 사진·결과물을 운영자에게 보내는 경로의 순수 규칙.
// 기존 피드백 경로(/api/feedback, feedback_submissions)를 그대로 쓰므로 새 표·마이그레이션이 없다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

/** 서버가 이 태그로 "결과물 공유"를 알아본다(관리자 화면이 접어 보여 준다). 클라이언트가 보낸 태그는 믿지 않고 서버가 직접 붙인다. */
export const SHARE_TAG = "[결과물 공유]";
/** 결과물 본문이 들어가므로 일반 피드백(2,000자)보다 크다. 저장 결과물은 길어도 수천 자라 넉넉하다. */
export const SHARE_MAX_CHARS = 40_000;

export interface ShareCard {
  label: string;
  /** 칸 본문(마크다운 그대로) */
  text: string;
  sources?: { n: number; title: string; url: string }[];
}

export interface ShareInput {
  subject?: string;
  topic?: string;
  /** 학생이 입력한(제작 전 질문 답 포함) 추가 요청 */
  instructions?: string;
  cards: ShareCard[];
}

/** 운영자가 읽는 한 덩어리 글로 만든다. 이메일·계정 정보는 어디에도 넣지 않는다. */
export function buildShareMessage(input: ShareInput): string {
  const lines: string[] = [];
  if (input.subject?.trim()) lines.push(`과목: ${input.subject.trim()}`);
  if (input.topic?.trim()) lines.push(`주제: ${input.topic.trim()}`);
  lines.push(`학생이 입력한 추가 요청: ${input.instructions?.trim() || "(없음)"}`);
  for (const c of input.cards) {
    lines.push("", `===== ${c.label} =====`, c.text.trim());
    if (c.sources && c.sources.length > 0) {
      lines.push("", "출처:", ...c.sources.map((s) => `[${s.n}] ${s.title} <${s.url}>`));
    }
  }
  const body = lines.join("\n");
  return body.length > SHARE_MAX_CHARS ? `${body.slice(0, SHARE_MAX_CHARS - 12)}\n…(이하 생략)` : body;
}

/** 저장할 글: 서버가 태그를 맨 앞에 한 번만 붙인다(클라이언트가 같은 태그를 붙여 보냈어도 중복되지 않게). */
export function withShareTag(message: string): string {
  const rest = message.startsWith(SHARE_TAG) ? message.slice(SHARE_TAG.length).replace(/^\s+/, "") : message;
  return `${SHARE_TAG}\n${rest}`;
}

export function isShareMessage(message: string): boolean {
  return message.startsWith(SHARE_TAG);
}

/** 이 창을 한 결과물에 한 번, 두 번 닫으면 더는 묻지 않는다(보낸 사람에게도 다시 묻지 않는다). */
export const SHARE_MAX_DISMISS = 2;

export function shouldAskShare(state: { off: boolean; dismissed: number; seenThisResult: boolean }): boolean {
  return !state.off && state.dismissed < SHARE_MAX_DISMISS && !state.seenThisResult;
}
