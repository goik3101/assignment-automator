import { ApiError } from "@google/genai";

// 일시적 오류(모델 과부하 503, 요청 폭주 429, 네트워크 순단)는 재시도하면 성공하는
// 경우가 많다. M1 실측 중에도 "This model is currently experiencing high demand"
// (503) 같은 일시적 오류를 실제로 겪었다 — 그때는 모델을 바꿔서 우회했지만,
// 모델과 무관하게 언제든 재발할 수 있어 재시도 로직을 공통으로 둔다.
const RETRYABLE_STATUS_CODES = [429, 500, 503];
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;

function isRetryable(err: unknown): boolean {
  if (err instanceof ApiError) return RETRYABLE_STATUS_CODES.includes(err.status);
  // fetch 실패 등 네트워크 오류도 일시적일 수 있으므로 재시도 대상에 포함.
  return err instanceof TypeError;
}

/**
 * Gemini API 호출을 감싸서, 일시적 오류(429/500/503, 네트워크 오류)에 한해
 * 지수 백오프로 재시도한다. 재시도를 다 써도 실패하면 마지막 에러를 그대로 던진다 —
 * 호출부(generate-essay.ts 등)에서 InsufficientDataResult 같은 사용자용 안내로 변환한다.
 */
export async function withGeminiRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === MAX_RETRIES || !isRetryable(err)) throw err;
      const delay = BASE_DELAY_MS * 2 ** attempt;
      console.warn(`[gemini retry] ${label} 실패 (${attempt + 1}/${MAX_RETRIES + 1}), ${delay}ms 후 재시도`, err);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
