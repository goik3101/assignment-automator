import { withLlmTrace, type Trace } from "./trace.ts";

// 생성 1건의 모델 호출량·비용 집계. 프롬프트·응답 본문·API 키는 다루지 않는다(라벨과 숫자만).
// 가격은 OpenAI 가격표(2026-10-22 developers.openai.com/api/docs/pricing 확인, 100만 토큰당 USD, 272K 이하 입력 기준)이며 바뀌면 여기만 고친다. 검색 호출은 호출당 요금이 따로 붙는다.
export const PRICES_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gpt-6-luna": { input: 0.1, output: 0.5 },
  "gpt-6-sol": { input: 2.0, output: 10.0 },
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
  "gpt-5.6-terra": { input: 2.0, output: 12.0 },
  "gpt-5.4": { input: 2.5, output: 15.0 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-5": { input: 1.25, output: 10.0 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
};
/** 우선 처리(priority) 등급의 토큰 단가 배율 — OpenAI 가격표 기준 추정값(약 1.8배). 실제 청구는 대시보드로 확인할 것. */
export const PRIORITY_MULTIPLIER = Number(process.env.OPENAI_PRIORITY_MULTIPLIER ?? 1.8);
/** 캐시로 처리된 입력 토큰의 단가 비율. gpt-5 계열 공식 가격표 기준 0.1배(예: gpt-5-mini $0.25 → $0.025). */
export const CACHED_INPUT_RATIO = 0.1;
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
  /** 입력 중 캐시로 처리된 토큰(비용은 입력 단가의 10%로 계산). */
  cachedInputTokens: number;
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
    inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, estimatedCostUsd: 0, unpriced: false, wallMs: now - trace.startedAt, sumCallMs: 0, byLabel: {},
  };
  const models = new Set<string>();
  for (const c of trace.calls) {
    s.calls++;
    if (!c.ok) s.failedCalls++;
    s.retries += c.retries;
    s.searchCalls += c.searchCalls;
    s.inputTokens += c.inputTokens;
    s.cachedInputTokens += c.cachedInputTokens ?? 0;
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
      else s.estimatedCostUsd += (((c.inputTokens - (c.cachedInputTokens ?? 0)) * p.input + (c.cachedInputTokens ?? 0) * p.input * CACHED_INPUT_RATIO + c.outputTokens * p.output) / 1e6) * (c.tier === "priority" ? PRIORITY_MULTIPLIER : 1) + c.searchCalls * SEARCH_CALL_USD;
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
  canExpose: (req: Request) => boolean = () => false,
  /** 요청이 끝날 때마다 부른다(대시보드 기록용). 던져도 응답에는 영향이 없다. */
  onDone?: (info: { name: string; summary: UsageSummary; status: number; threw: boolean }) => Promise<void> | void
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
      if (onDone) {
        try {
          await onDone({ name, summary, status: thrown ? 500 : (res?.status ?? 200), threw: !!thrown });
        } catch {
          /* 기록 실패는 사용자 응답과 무관하다 */
        }
      }
      if (thrown) throw thrown;
      if (res && summary.calls > 0 && args[0].headers.get("x-studed-test") === "1" && canExpose(args[0])) {
        try {
          res.headers.set("x-llm-usage", JSON.stringify(summary));
        } catch {
          /* 헤더가 불변인 응답이면 로그만 남긴다 */
        }
      }
      return res;
    });
}
