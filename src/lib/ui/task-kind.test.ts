import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTaskKind } from "./task-kind.ts";

test("제목 키워드로 과제 유형을 고른다", () => {
  assert.equal(classifyTaskKind("수필(창작)"), "creative");
  assert.equal(classifyTaskKind("찬반 논설문"), "creative");
  assert.equal(classifyTaskKind("독서 감상문"), "creative");
  assert.equal(classifyTaskKind("조사 보고서"), "research");
  assert.equal(classifyTaskKind("영어 단어 퀴즈"), "memorize");
  assert.equal(classifyTaskKind("인권 선구자의 업적 탐구를 통한 저널 쓰기"), "mixed");
});

test("한 글자 키워드 오탐 없이, 아무것도 안 걸리면 창작·작성형", () => {
  assert.equal(classifyTaskKind("시험 대비"), "memorize");
  assert.equal(classifyTaskKind("국어"), "creative");
  assert.equal(classifyTaskKind(null, undefined), "creative");
});
