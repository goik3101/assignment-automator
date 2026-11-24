// 피드백을 누가 보냈는지 정하는 규칙. alias import 없음 — node:test에서 바로 불러온다.
//
// 익명이 기본이다. 이메일(계정)로 보내기를 직접 고른 로그인 사용자만 user_id가 저장되고, 그때만 개발자 답변을 받아 볼 수 있다.
// "개선 돕기"(안내문 사진·결과물 공유)는 어떤 선택에서도 계정과 잇지 않는다(개인정보처리방침의 약속).

export type FeedbackIdentity = "anonymous" | "account";

export function parseIdentity(value: unknown): FeedbackIdentity {
  return value === "account" ? "account" : "anonymous";
}

/** 저장할 user_id. 공유는 항상 비움, 그 밖에는 계정으로 보내기를 고르고 로그인한 경우만. */
export function feedbackUserId(identity: FeedbackIdentity, share: boolean, userId: string | null | undefined): string | null {
  if (share || identity !== "account") return null;
  return userId ?? null;
}

/** 개발자 답변 한도(글자). */
export const REPLY_MAX = 1500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isFeedbackId(id: unknown): id is string {
  return typeof id === "string" && UUID.test(id);
}
