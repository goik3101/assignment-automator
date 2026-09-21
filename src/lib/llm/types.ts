// 모델 호출 공통 계층의 타입. 서비스 코드는 특정 회사 SDK를 직접 쓰지 않고 이 타입만 본다.
// 스키마는 당분간 기존(Gemini 스타일) Schema 객체를 원본으로 두고, OpenAI 제공자가 변환한다(schema-convert.ts).
import type { Schema } from "@google/genai";

export type ModelRole = "main" | "lite";
export type Effort = "minimal" | "low" | "medium";

export type LlmPart = { text: string } | { image: { base64: string; mimeType: string } };

export interface LlmRequest {
  /** 로그·오류·비용 집계용 이름(예: "generateEssay:stepA"). */
  label: string;
  role: ModelRole;
  prompt: string | LlmPart[];
  system?: string;
  /** 있으면 구조화 JSON 출력을 요청한다. */
  schema?: Schema;
  /** 있으면 웹 검색 도구를 켠다. force=true면 검색을 반드시 호출하게 한다(지원하는 제공자에서만). */
  search?: { force?: boolean; /** 한 요청에서 검색 도구를 부를 수 있는 최대 횟수(비용·시간 상한). OpenAI만 적용. */ maxCalls?: number };
  /** 지원하지 않는 모델에서는 무시된다(gpt-5 계열은 temperature를 거부). */
  temperature?: number;
  /** 추론 강도. Gemini는 무시. 검색이 켜진 요청은 최소 "low"로 올려서 보낸다. */
  effort?: Effort;
  maxOutputTokens?: number;
}

// Gemini 검색 그라운딩과 같은 모양으로 정규화한 검색 결과 메타데이터 — citations.ts가 그대로 쓴다.
export interface GroundingChunkLike {
  web?: { uri?: string; title?: string };
}
export interface GroundingSupportLike {
  /** startIndex/endIndex의 단위는 unit을 따른다(Gemini=utf8 바이트, OpenAI=utf16 글자). 기본 utf8. */
  segment?: { startIndex?: number; endIndex?: number };
  groundingChunkIndices?: number[];
  unit?: "utf8" | "utf16";
}
export interface SearchGrounding {
  queries: string[];
  chunks: GroundingChunkLike[];
  supports: GroundingSupportLike[];
  searchCalls: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  searchCalls: number;
}

export interface LlmResponse {
  text: string;
  grounding?: SearchGrounding;
  usage: LlmUsage;
  provider: string;
  model: string;
}

export type LlmErrorKind =
  | "rate_limit" // 요청 폭주(재시도 가능)
  | "quota" // 크레딧/한도 소진(재시도 무의미)
  | "timeout"
  | "network"
  | "server" // 5xx(재시도 가능)
  | "tool" // 검색 도구 오류
  | "invalid_output" // 구조화 출력이 스키마/JSON이 아님
  | "empty_output" // 응답 본문이 비었음(추론이 출력 한도를 먹은 경우 등)
  | "auth"
  | "bad_request"
  | "unknown";

export class LlmError extends Error {
  kind: LlmErrorKind;
  retryable: boolean;
  status?: number;
  /** 서버가 알려준 재시도 대기 시간(ms). 있으면 지수 백오프 대신 이 값을 쓴다. */
  retryAfterMs?: number;
  constructor(message: string, kind: LlmErrorKind, retryable: boolean, status?: number) {
    super(message);
    this.name = "LlmError";
    this.kind = kind;
    this.retryable = retryable;
    this.status = status;
  }
}

export interface LlmProvider {
  name: "gemini" | "openai";
  model(role: ModelRole): string;
  generate(req: LlmRequest, model: string): Promise<LlmResponse>;
  embed(text: string, purpose: "clustering" | "diversity"): Promise<number[]>;
}
