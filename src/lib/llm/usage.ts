import { withLlmTrace, type Trace } from "./trace.ts";

// 생성 1건의 모델 호출량·비용 집계. 프롬프트·응답 본문·API 키는 다루지 않는다(라벨과 숫자만).
// 가격은 OpenAI 가격표(2026-09 확인, 100만 토큰당 USD)이며 바뀌면 여기만 고친다. 검색 호출은 호출당 요금이 따로 붙는다.
export const PRICES_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
};
export const SEARCH_CALL_USD = 0.01; // web_search 도구 호출 1회(검색 결과 토큰은 모델 입력 토큰으로 별도 청구되어 위 표에 포함)

export interface UsageSummary {
  name: string;
  provider: string;
  models: string[];
  calls: number;
  failedCalls: number;
  retries: number;
  searchCalls: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  estimatedCostUsd: number;
  /** 가격표에 없는 모델이 섞여 비용을 과소 추정했을 수 있음. */
  unpriced: boolean;
  /** 요청 전체 경과 시간과, 개별 호출 시간의 합(병렬이면 합이 더 큼). */
  wallMs: number;
  sumCallMs: number;
  byLabel: Record<string, { calls: number; ms: number; searchCalls: number }>;
}

export function summarizeTrace(trace: Trace, now = Date.now()): UsageSummary {
  const s: UsageSummary = {
    name: trace.name, provider: trace.calls[0]?.provider ?? "-", models: [], calls: 0, failedCalls: 0, retries: 0, searchCalls: 0,
    inputTokens: 0, outputTokens: 0, reasoningTokens: 0, estimatedCostUsd: 0, unpriced: false, wallMs: now - trace.startedAt, sumCallMs: 0, byLabel: {},
  };
  const models = new Set<string>();
  for (const c of trace.calls) {
    s.calls++;
    if (!c.ok) s.failedCalls++;
    s.retries += c.retries;
    s.searchCalls += c.searchCalls;
    s.inputTokens += c.inputTokens;
    s.outputTokens += c.outputTokens;
    s.reasoningTokens += c.reasoningTokens;
    s.sumCallMs += c.ms;
    models.add(c.model);
    const l = (s.byLabel[c.label] ??= { calls: 0, ms: 0, searchCalls: 0 });
    l.calls++;
    l.ms += c.ms;
    l.searchCalls += c.searchCalls;
    if (c.provider === "openai") {
      const p = PRICES_PER_MILLION[c.model];
      if (!p) s.unpriced = true;
      else s.estimatedCostUsd += (c.inputTokens * p.input + c.outputTokens * p.output) / 1e6 + c.searchCalls * SEARCH_CALL_USD;
    }
  }
  s.models = [...models];
  s.estimatedCostUsd = Math.round(s.estimatedCostUsd * 1e5) / 1e5;
  return s;
}

/**
 * 라우트 핸들러를 감싸 요청 단위로 호출량을 모으고 로그 한 줄로 남긴다. 관리자 테스트 요청(x-studed-test: 1)에는
 * 응답 헤더 x-llm-usage로도 돌려준다(테스트 스크립트가 원가를 재기 위함).
 */
export function withUsageLogging<A extends [Request, ...unknown[]]>(
  name: string,
  handler: (...args: A) => Promise<Response | undefined>,
  canExpose: (req: Request) => boolean = () => false
): (...args: A) => Promise<Response | undefined> {
  return (...args: A) =>
    withLlmTrace(name, async (trace) => {
      let res: Response | undefined;
      let thrown: unknown;
      try {
        res = await handler(...args);
      } catch (e) {
        thrown = e;
      }
      const summary = summarizeTrace(trace);
      if (summary.calls > 0) console.log("[llm-usage] " + JSON.stringify(summary));
      if (thrown) throw thrown;
      if (res && summary.calls > 0 && args[0].headers.get("x-studed-test") === "1" && canExpose(args[0])) {
        try {
          res.headers.set("x-llm-usage", JSON.stringify({ ...summary, byLabel: undefined }));
        } catch {
          /* 헤더가 불변인 응답이면 로그만 남긴다 */
        }
      }
      return res;
    });
}
