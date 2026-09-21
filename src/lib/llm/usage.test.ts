import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeTrace, SEARCH_CALL_USD } from "./usage.ts";
import type { Trace } from "./trace.ts";

const call = (o: Partial<Trace["calls"][number]>): Trace["calls"][number] => ({ label: "x", provider: "openai", model: "gpt-5-mini", ms: 1000, ok: true, retries: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, searchCalls: 0, ...o });

test("비용: 토큰 단가 + 검색 호출당 $0.01", () => {
  const t: Trace = { name: "essay", startedAt: 0, calls: [call({ inputTokens: 10000, outputTokens: 1000, searchCalls: 2 }), call({ label: "y", inputTokens: 2000, outputTokens: 500 })] };
  const s = summarizeTrace(t, 5000);
  // (10000*0.25 + 1000*2)/1e6 = 0.0045 ; (2000*0.25+500*2)/1e6 = 0.0015 ; 검색 2회 = 0.02
  assert.equal(s.estimatedCostUsd, Math.round((0.0045 + 0.0015 + 2 * SEARCH_CALL_USD) * 1e5) / 1e5);
  assert.equal(s.calls, 2);
  assert.equal(s.searchCalls, 2);
  assert.equal(s.wallMs, 5000);
  assert.equal(s.byLabel.x.calls, 1);
});

test("실패·재시도 집계, 가격표에 없는 모델은 unpriced 표시", () => {
  const t: Trace = { name: "x", startedAt: 0, calls: [call({ ok: false, retries: 2, errorKind: "server" }), call({ model: "unknown-model", inputTokens: 1000 })] };
  const s = summarizeTrace(t, 10);
  assert.equal(s.failedCalls, 1);
  assert.equal(s.retries, 2);
  assert.equal(s.unpriced, true);
});

test("Gemini 호출은 비용을 추정하지 않는다(가격표는 OpenAI 기준)", () => {
  const s = summarizeTrace({ name: "x", startedAt: 0, calls: [call({ provider: "gemini", model: "gemini-x", inputTokens: 1e6 })] }, 1);
  assert.equal(s.estimatedCostUsd, 0);
});

test("요약에 프롬프트·키·본문 관련 필드가 없다", () => {
  const s = JSON.stringify(summarizeTrace({ name: "x", startedAt: 0, calls: [call({})] }, 1));
  assert.ok(!/prompt|apiKey|api_key|text|authorization/i.test(s));
});
