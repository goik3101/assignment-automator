import { test } from "node:test";
import assert from "node:assert/strict";
import { isUuid, validateAnalyzeInput, validateCoreTaskInfo } from "./validate.ts";

test("입력 크기·형식 검증", () => {
  assert.equal(validateAnalyzeInput({ topicText: "가".repeat(9000) })?.includes("너무 깁니다"), true);
  assert.equal(validateAnalyzeInput({ topicText: "정상" }), null);
  assert.ok(validateAnalyzeInput({ topicText: 123 }));
});
test("coreTaskInfo: 요소 0개·형식 오류는 거절", () => {
  assert.ok(validateCoreTaskInfo({ topic: "x", task_elements: [] }));
  assert.ok(validateCoreTaskInfo(null));
  assert.ok(validateCoreTaskInfo({ topic: "x", task_elements: [{ nolabel: 1 }] }));
  assert.equal(validateCoreTaskInfo({ topic: "x", task_elements: [{ label: "a" }] }), null);
});
test("uuid", () => {
  assert.equal(isUuid("00000000-0000-0000-0000-000000000000"), true);
  assert.equal(isUuid("not-a-uuid"), false);
});
