import { test } from "node:test";
import assert from "node:assert/strict";
import { findMissingItems } from "./research-items.ts";

const ITEMS = ["인터뷰 대상", "질문1", "답변1", "질문2", "답변2"];

test("소제목이 있으면 예전처럼 본문 길이로 본다", () => {
  const c = "### 인터뷰 대상\n제주 4·3 당시 마을 이장이던 김 모씨\n### 질문1\n그날 마을 분위기는 어땠습니까?\n### 답변1\n총소리가 밤새 이어져 모두 집 안에 숨었습니다.\n### 질문2\n그 뒤에는 어떻게 지내셨습니까?\n### 답변2\n한동안 산에서 내려오지 못했습니다, 그래도 살아남았지요.";
  assert.deepEqual(findMissingItems(c, ITEMS), []);
});

test("소제목 없이 '질문1: … 답변1: …'로 쓴 글은 비었다고 하지 않는다(결과물34 거짓 경고)", () => {
  const c =
    "인터뷰 대상: 제주 4·3 당시 마을 이장이던 김 모씨\n\n질문1: 그날 마을 분위기는 어땠습니까? 답변1: 총소리가 밤새 이어져 모두 집 안에 숨었습니다.\n\n질문2: 그 뒤에는 어떻게 지내셨습니까? 답변2: 한동안 산에서 내려오지 못했지만 살아남았습니다.";
  assert.deepEqual(findMissingItems(c, ITEMS), []);
});

test("칸 이름이 정말 없으면 여전히 누락으로 센다", () => {
  const c = "질문1: 그날 마을 분위기는 어땠습니까? 답변1: 총소리가 밤새 이어져 모두 집 안에 숨었습니다.";
  assert.deepEqual(findMissingItems(c, ITEMS), ["인터뷰 대상", "질문2", "답변2"]);
});

test("칸 이름 뒤가 비어 있으면 누락이다", () => {
  const c = "질문1: 그날 분위기는? 답변1:\n질문2: 그 뒤는? 답변2: 한동안 산에서 내려오지 못했지만 살아남았습니다.";
  assert.ok(findMissingItems(c, ["질문1", "답변1", "질문2", "답변2"]).includes("답변1"));
});
