import { test } from "node:test";
import assert from "node:assert/strict";
import { generate, generateJson, setProviderForTest, withLlmTrace, LlmError, type LlmProvider, type LlmRequest, type LlmResponse } from "./index.ts";

function fake(behaviors: (() => LlmResponse | LlmError)[]): LlmProvider & { calls: { req: LlmRequest; model: string }[] } {
  const calls: { req: LlmRequest; model: string }[] = [];
  let i = 0;
  return {
    name: "gemini",
    calls,
    model: (role) => (role === "main" ? "main-model" : "lite-model"),
    async generate(req, model) {
      calls.push({ req, model });
      const b = behaviors[Math.min(i++, behaviors.length - 1)]();
      if (b instanceof LlmError) throw b;
      return b;
    },
    async embed() {
      return [0.1, 0.2];
    },
  };
}
const ok = (text: string, extra: Partial<LlmResponse> = {}): LlmResponse => ({ text, usage: { inputTokens: 10, outputTokens: 5, searchCalls: 0 }, provider: "gemini", model: "m", ...extra });

test("역할(main/lite)이 제공자의 모델 이름으로 바뀌어 전달된다", async () => {
  const p = fake([() => ok("a")]);
  setProviderForTest(p);
  await generate({ label: "t", role: "lite", prompt: "x" });
  await generate({ label: "t", role: "main", prompt: "x" });
  assert.deepEqual(p.calls.map((c) => c.model), ["lite-model", "main-model"]);
  setProviderForTest(null);
});

test("일시적 오류(rate_limit)는 재시도하고, quota는 즉시 던진다", async () => {
  const p = fake([() => new LlmError("429", "rate_limit", true, 429), () => new LlmError("429", "rate_limit", true, 429), () => ok("성공")]);
  setProviderForTest(p);
  const r = await generate({ label: "retry", role: "main", prompt: "x" });
  assert.equal(r.text, "성공");
  assert.equal(p.calls.length, 3);

  const q = fake([() => new LlmError("크레딧 소진", "quota", false, 402)]);
  setProviderForTest(q);
  await assert.rejects(() => generate({ label: "quota", role: "main", prompt: "x" }), (e: LlmError) => e.kind === "quota");
  assert.equal(q.calls.length, 1);
  setProviderForTest(null);
});

test("재시도를 다 써도 실패하면 마지막 오류를 던진다(총 3회 시도)", async () => {
  const p = fake([() => new LlmError("503", "server", true, 503)]);
  setProviderForTest(p);
  await assert.rejects(() => generate({ label: "x", role: "main", prompt: "x" }), (e: LlmError) => e.kind === "server");
  assert.equal(p.calls.length, 3);
  setProviderForTest(null);
});

test("trace: 호출 수·토큰·검색 횟수·재시도·실패가 기록된다(프롬프트 내용은 기록하지 않는다)", async () => {
  const p = fake([() => new LlmError("x", "rate_limit", true, 429), () => ok("a", { usage: { inputTokens: 100, outputTokens: 20, searchCalls: 2 } })]);
  setProviderForTest(p);
  const trace = await withLlmTrace("test", async (t) => {
    await generate({ label: "search", role: "main", prompt: "비밀 내용", search: {} });
    return t;
  });
  assert.equal(trace.calls.length, 1);
  assert.equal(trace.calls[0].retries, 1);
  assert.equal(trace.calls[0].searchCalls, 2);
  assert.equal(trace.calls[0].inputTokens, 100);
  assert.ok(!JSON.stringify(trace).includes("비밀 내용"));
  setProviderForTest(null);
});

test("generateJson: 정상 파싱 / 빈 출력 / JSON 아님을 구분해서 던진다", async () => {
  const schema = { type: "OBJECT" } as never;
  setProviderForTest(fake([() => ok('{"a":1}')]));
  const r = await generateJson<{ a: number }>({ label: "j", role: "lite", prompt: "x", schema });
  assert.equal(r.data.a, 1);

  setProviderForTest(fake([() => ok("")]));
  await assert.rejects(() => generateJson({ label: "j", role: "lite", prompt: "x", schema }), (e: LlmError) => e.kind === "empty_output");

  setProviderForTest(fake([() => ok("not json")]));
  await assert.rejects(() => generateJson({ label: "j", role: "lite", prompt: "x", schema }), (e: LlmError) => e.kind === "invalid_output");
  setProviderForTest(null);
});
