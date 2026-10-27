import { test } from "node:test";
import assert from "node:assert/strict";
import { setProviderForTest, type LlmProvider, type LlmResponse } from "../llm/index.ts";
import { checkFormRequirements, type CountReq } from "./form-requirements.ts";
import { formWarningText, repairFormRequirements } from "./form-repair.ts";

const ok = (text: string): LlmResponse => ({ text, usage: { inputTokens: 10, outputTokens: 5, searchCalls: 0 }, provider: "gemini", model: "m" });
function withModel(texts: string[]) {
  let i = 0;
  const prompts: string[] = [];
  const p: LlmProvider = {
    name: "gemini",
    model: () => "m",
    async generate(req) {
      prompts.push(typeof req.prompt === "string" ? req.prompt : "");
      return ok(texts[Math.min(i++, texts.length - 1)]);
    },
    async embed() {
      return [0];
    },
  };
  setProviderForTest(p);
  return prompts;
}

const reqs: CountReq[] = [{ unit: "sentence", word: "문장", min: 0, max: 5 }];
const long = "안녕하세요. 통학로 문제를 다룹니다. 신호가 짧습니다[1]. 사고가 늘고 있습니다. 해결 방안을 제안합니다. 신호를 늘려야 합니다. 감사합니다.";

test("조건을 어긴 단계를 한 번 고치고, 고친 글이 조건을 지키면 채택한다", async () => {
  const prompts = withModel(["안녕하세요. 통학로 신호가 짧아 사고가 늘고 있습니다[1]. 신호를 늘려야 합니다. 감사합니다."]);
  const issues = checkFormRequirements(long, reqs);
  const r = await repairFormRequirements({ label: "발표 대본", content: long, description: "발표", reqs, issues });
  setProviderForTest(null);
  assert.equal(r.repaired, true);
  assert.deepEqual(r.remaining, []);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /현재 7문장이다/); // 실제 문장 수와 조건을 지시에 담는다
});

test("새 각주 번호를 만들면 원문을 유지한다", async () => {
  withModel(["안녕하세요. 신호가 짧습니다[7]. 감사합니다."]);
  const r = await repairFormRequirements({ label: "발표 대본", content: long, description: "", reqs, issues: checkFormRequirements(long, reqs) });
  setProviderForTest(null);
  assert.equal(r.repaired, false);
  assert.equal(r.content, long);
  assert.equal(r.remaining.length, 1);
});

test("나아지지 않으면(여전히 7문장) 원문을 유지하고 남은 위반을 돌려준다", async () => {
  withModel([long]);
  const r = await repairFormRequirements({ label: "발표 대본", content: long, description: "", reqs, issues: checkFormRequirements(long, reqs) });
  setProviderForTest(null);
  assert.equal(r.repaired, false);
  assert.match(formWarningText(r.remaining), /문장 조건 5개 이내, 실제 7개/);
});

test("조금만 나아져도(7→6문장) 채택하되 남은 위반은 경고로 남긴다", async () => {
  withModel(["안녕하세요. 통학로 문제를 다룹니다. 신호가 짧습니다[1]. 사고가 늘고 있습니다. 해결 방안을 제안합니다. 감사합니다."]);
  const r = await repairFormRequirements({ label: "발표 대본", content: long, description: "", reqs, issues: checkFormRequirements(long, reqs) });
  setProviderForTest(null);
  assert.equal(r.repaired, true);
  assert.equal(r.remaining[0].actual, 6);
});

test("모델 호출이 실패하면 원문을 그대로 돌려준다(생성을 막지 않는다)", async () => {
  setProviderForTest({ name: "gemini", model: () => "m", async generate() { throw new Error("boom"); }, async embed() { return [0]; } });
  const r = await repairFormRequirements({ label: "발표 대본", content: long, description: "", reqs, issues: checkFormRequirements(long, reqs) });
  setProviderForTest(null);
  assert.equal(r.repaired, false);
  assert.equal(r.content, long);
});
