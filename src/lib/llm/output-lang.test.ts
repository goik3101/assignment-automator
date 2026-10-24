import { test } from "node:test";
import assert from "node:assert/strict";
import { currentOutputLang, scaleLengthsForEnglish, withOutputLang } from "./output-lang.ts";
import type { CoreTaskInfo } from "../../types/task.ts";

test("결과물 언어: 감싼 요청 안에서만 English, 밖에서는 한국어", async () => {
  assert.equal(currentOutputLang(), "ko");
  assert.equal(await withOutputLang("en", async () => currentOutputLang()), "en");
  assert.equal(currentOutputLang(), "ko");
});

test("영어로 쓸 때 글자 수 기준만 늘리고 단어 수 기준은 그대로 둔다", () => {
  const info = {
    topic: "t",
    requirements: [],
    task_elements: [
      { type: "text_submission", label: "발표", description: "", target_length: { min: 540, max: 660, counts_spaces: true } },
      { type: "text_submission", label: "영어 글", description: "", target_length: { min: 120, max: 150, counts_spaces: true, unit: "words" } },
      { type: "text_submission", label: "개요", description: "" },
    ],
  } as CoreTaskInfo;
  const out = scaleLengthsForEnglish(info).task_elements;
  assert.deepEqual(out[0].target_length, { min: 1350, max: 1650, counts_spaces: true });
  assert.deepEqual(out[1].target_length, info.task_elements[1].target_length);
  assert.equal(out[2].target_length, undefined);
});
