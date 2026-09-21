import { geminiProvider } from "./providers/gemini.ts";
import { openaiProvider } from "./providers/openai.ts";
import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse, type ModelRole } from "./types.ts";
import { recordCall } from "./trace.ts";

export * from "./types.ts";
export { withLlmTrace, currentTrace } from "./trace.ts";

// 서비스 코드가 모델을 부르는 유일한 입구. 제공자는 환경변수 LLM_PROVIDER 하나로 정한다(파이프라인 안에서 섞지 않는다).
let override: LlmProvider | null = null;
/** 테스트에서 가짜 제공자를 꽂는다. */
export function setProviderForTest(p: LlmProvider | null) {
  override = p;
}

export function getProvider(): LlmProvider {
  if (override) return override;
  return process.env.LLM_PROVIDER === "openai" ? openaiProvider : geminiProvider;
}

export function llmModel(role: ModelRole): string {
  return getProvider().model(role);
}

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 일시적 오류(rate_limit/server/timeout/network)만 지수 백오프로 재시도한다. quota·auth·bad_request는 즉시 던진다. */
export async function generate(req: LlmRequest): Promise<LlmResponse> {
  const provider = getProvider();
  const model = provider.model(req.role);
  const started = Date.now();
  let retries = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await provider.generate(req, model);
      recordCall({
        label: req.label, provider: provider.name, model, ms: Date.now() - started, ok: true, retries,
        inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens,
        reasoningTokens: res.usage.reasoningTokens ?? 0, searchCalls: res.usage.searchCalls,
      });
      return res;
    } catch (e) {
      const err = e instanceof LlmError ? e : new LlmError(e instanceof Error ? e.message : String(e), "unknown", false);
      if (!err.retryable || attempt >= MAX_RETRIES) {
        recordCall({
          label: req.label, provider: provider.name, model, ms: Date.now() - started, ok: false, retries,
          errorKind: err.kind, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, searchCalls: 0,
        });
        throw err;
      }
      retries++;
      const delay = BASE_DELAY_MS * 2 ** attempt;
      console.warn(`[llm retry] ${req.label} ${err.kind} (${attempt + 1}/${MAX_RETRIES + 1}), ${delay}ms 후 재시도`);
      await sleep(delay);
    }
  }
}

/** 구조화 JSON 출력. 스키마는 req.schema로 넘기고, 파싱된 객체를 돌려준다. */
export async function generateJson<T>(req: LlmRequest): Promise<{ data: T; response: LlmResponse }> {
  if (!req.schema) throw new LlmError("generateJson에는 schema가 필요합니다.", "bad_request", false);
  const response = await generate(req);
  if (!response.text) throw new LlmError(`${req.label}: 구조화 출력이 비어 있습니다.`, "empty_output", false);
  try {
    return { data: JSON.parse(response.text) as T, response };
  } catch {
    throw new LlmError(`${req.label}: 구조화 출력이 JSON이 아닙니다.`, "invalid_output", false);
  }
}

export async function embedText(text: string, purpose: "clustering" | "diversity"): Promise<number[]> {
  return getProvider().embed(text, purpose);
}
