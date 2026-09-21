import { LlmError, type LlmProvider } from "../types.ts";

// OpenAI 제공자 — 2~6단계에서 구현한다(스키마 변환, 검색, 출처 처리, 임베딩, 오류 처리).
// 1단계에서는 계층만 만들고, 아직 선택되지 않도록 LLM_PROVIDER 기본값은 gemini로 둔다.
export const openaiProvider: LlmProvider = {
  name: "openai",
  model(role) {
    return role === "main" ? process.env.OPENAI_MODEL_MAIN ?? "gpt-5-mini" : process.env.OPENAI_MODEL_LITE ?? "gpt-5-mini";
  },
  async generate() {
    throw new LlmError("OpenAI 제공자는 아직 구현되지 않았습니다(마이그레이션 2~6단계).", "unknown", false);
  },
  async embed() {
    throw new LlmError("OpenAI 임베딩은 아직 구현되지 않았습니다(마이그레이션 5단계).", "unknown", false);
  },
};
