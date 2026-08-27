import { GoogleGenAI } from "@google/genai";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `환경변수 ${name}가 설정되어 있지 않습니다. .env.local 파일을 확인하세요 (.env.example 참고).`
    );
  }
  return value;
}

let _ai: GoogleGenAI | null = null;

/** Gemini API 클라이언트. 서버 코드에서만 호출할 것 — API 키가 클라이언트로 노출되면 안 됨. */
export function getGeminiClient(): GoogleGenAI {
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
  }
  return _ai;
}

// 모델 이름은 전부 환경변수에서 읽는다 — 구글이 모델을 교체해도 코드 수정 없이 대응하기 위함.
// (기획서 5번 챕터: "모델명/가격은 실제 개발 착수 직전에 재확인할 것")
export const GEMINI_MODELS = {
  get flashLite() {
    return process.env.GEMINI_MODEL_FLASH_LITE ?? "gemini-3.5-flash-lite";
  },
  get flash() {
    return process.env.GEMINI_MODEL_FLASH ?? "gemini-3.7-flash";
  },
  get embedding() {
    return process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-2";
  },
};

export const EMBEDDING_DIMENSIONS = Number(
  process.env.GEMINI_EMBEDDING_DIMENSIONS ?? 768
);
