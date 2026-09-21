import { restoreOptional } from "../schema-convert.ts";
import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse, type ModelRole } from "../types.ts";
import { buildRequestBody, checkBody, classifyHttpError, normalizeResponse, type OpenAiResponse } from "./openai-core.ts";

// OpenAI Responses API 제공자(SDK 없이 fetch로 직접 호출 — 의존성을 늘리지 않는다).
// API 키는 OPENAI_API_KEY를 쓰고, 마이그레이션 기간에만 예전 이름 OPEN_API_KEY도 읽는다(제거 예정).
const BASE = "https://api.openai.com/v1";

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY || process.env.OPEN_API_KEY;
  if (!key) throw new LlmError("OPENAI_API_KEY 환경변수가 설정되어 있지 않습니다.", "auth", false);
  return key;
}

const timeoutMs = (search: boolean) => Number(process.env.OPENAI_TIMEOUT_MS ?? (search ? 55_000 : 45_000));

async function post(path: string, body: unknown, ms: number): Promise<{ status: number; json: unknown; retryAfterMs?: number }> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey()}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ms),
    });
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) throw new LlmError(`OpenAI 요청이 ${ms}ms 안에 끝나지 않았습니다.`, "timeout", true);
    throw new LlmError(err instanceof Error ? err.message : "네트워크 오류", "network", true);
  }
  const json = await res.json().catch(() => null);
  const ra = res.headers.get("retry-after-ms") ?? (res.headers.get("retry-after") ? String(Number(res.headers.get("retry-after")) * 1000) : null);
  return { status: res.status, json, retryAfterMs: ra && Number.isFinite(Number(ra)) ? Number(ra) : undefined };
}

export const openaiProvider: LlmProvider = {
  name: "openai",
  model(role: ModelRole) {
    return role === "main" ? process.env.OPENAI_MODEL_MAIN ?? "gpt-5-mini" : process.env.OPENAI_MODEL_LITE ?? "gpt-5-mini";
  },
  async generate(req: LlmRequest, model: string): Promise<LlmResponse> {
    const search = !!req.search;
    const contextSize = process.env.OPENAI_SEARCH_CONTEXT_SIZE ?? "low";
    let body = buildRequestBody(req, model, { searchContextSize: contextSize });
    for (let pass = 0; pass < 2; pass++) {
      const { status, json, retryAfterMs } = await post("/responses", body, timeoutMs(search));
      if (status >= 400) throw classifyHttpError(status, json as never, retryAfterMs);
      const resp = json as OpenAiResponse;
      const n = normalizeResponse(resp, search);
      const problem = checkBody(resp, n);
      if (problem) {
        // 추론이 출력 한도를 다 써서 본문이 빈 경우: 한도를 두 배로 늘려 한 번만 다시 시도한다.
        if (problem.kind === "empty_output" && pass === 0 && resp.status === "incomplete") {
          const cur = Number(body.max_output_tokens ?? 6000);
          body = { ...body, max_output_tokens: Math.min(cur * 2, 32000) };
          continue;
        }
        throw problem;
      }
      let text = n.text;
      if (req.schema) {
        try {
          text = JSON.stringify(restoreOptional(JSON.parse(text), req.schema));
        } catch {
          throw new LlmError(`${req.label}: 구조화 출력이 JSON이 아닙니다.`, "invalid_output", true);
        }
      }
      return {
        text,
        grounding: n.grounding,
        usage: { inputTokens: n.usage.inputTokens, outputTokens: n.usage.outputTokens, reasoningTokens: n.usage.reasoningTokens, searchCalls: n.usage.searchCalls },
        provider: "openai",
        model,
      };
    }
    throw new LlmError("응답을 받지 못했습니다.", "empty_output", false);
  },
  async embed(text) {
    const model = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
    const dimensions = Number(process.env.OPENAI_EMBEDDING_DIMENSIONS ?? 768);
    const { status, json, retryAfterMs } = await post("/embeddings", { model, input: text.slice(0, 9000), dimensions }, 30_000);
    if (status >= 400) throw classifyHttpError(status, json as never, retryAfterMs);
    const v = (json as { data?: { embedding?: number[] }[] } | null)?.data?.[0]?.embedding;
    if (!v || v.length !== dimensions) throw new LlmError("임베딩 응답이 비어 있거나 차원이 다릅니다.", "empty_output", false);
    return v;
  },
};
