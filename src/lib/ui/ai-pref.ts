import type { AiMode } from "@/lib/questions/questions-pure";

// AI 설정의 "만드는 방식": 빠르게 만들기(기본, 제작 전 질문 최대 2개) / 나에게 맞추기(최대 4개).
// 계정이 없어도 쓸 수 있게 브라우저에 저장한다(서버 DB를 바꾸지 않는다).
const KEY = "studed-ai-mode";
const EVENT = "studed:ai-mode";

export function getAiMode(): AiMode {
  try {
    return localStorage.getItem(KEY) === "personal" ? "personal" : "fast";
  } catch {
    return "fast";
  }
}

export function setAiMode(mode: AiMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // 저장소를 못 쓰면 이번 방문에만 적용된다.
  }
  window.dispatchEvent(new CustomEvent<AiMode>(EVENT, { detail: mode }));
}

export const AI_MODE_INFO: Record<AiMode, { label: string; summary: string }> = {
  fast: { label: "빠르게 만들기", summary: "꼭 필요한 질문만(최대 2개) 하고 바로 만들어요." },
  personal: { label: "나에게 맞추기", summary: "내 선택과 경험을 더 물어보고(최대 4개) 나에게 맞춰 만들어요." },
};
