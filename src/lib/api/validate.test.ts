import { test } from "node:test";
import assert from "node:assert/strict";
import { isUuid, validateAnalyzeInput, validateCoreTaskInfo, IMAGE_MIME_PATTERN } from "./validate.ts";

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

test("생성 입력 필드: 길이·형식 상한", async () => {
  const { validateGenerationFields, checkText } = await import("./validate.ts");
  assert.equal(validateGenerationFields({ subject: "국어", revisionInstructions: "더 짧게" }), null);
  assert.equal(validateGenerationFields({}), null);
  assert.ok(validateGenerationFields({ subject: "가".repeat(301) }));
  assert.ok(validateGenerationFields({ revisionInstructions: "가".repeat(3001) }));
  assert.ok(validateGenerationFields({ referenceFactsText: "가".repeat(100_001) }));
  assert.ok(validateGenerationFields({ subject: { a: 1 } }));
  assert.equal(checkText(null, 5, "x"), null);
  assert.ok(checkText("123456", 5, "x"));
});

test("이미지 MIME: image/* 형식만, data URL을 깨는 문자는 거절", () => {
  for (const ok of ["image/jpeg", "image/png", "image/heic", "image/svg+xml"]) assert.equal(IMAGE_MIME_PATTERN.test(ok), true);
  for (const bad of ["text/html", "image/png;base64,AAA", "image/png,evil", "image/", "", "image/png\n"]) assert.equal(IMAGE_MIME_PATTERN.test(bad), false);
  assert.ok(validateAnalyzeInput({ imageBase64: "AAA", imageMimeType: "image/png;x=1", topicText: "t" }));
  assert.equal(validateAnalyzeInput({ imageBase64: "AAA", imageMimeType: "image/jpeg" }), null);
  assert.equal(validateAnalyzeInput({ imageBase64: "AAA", imageMimeType: "" }), null);
});
