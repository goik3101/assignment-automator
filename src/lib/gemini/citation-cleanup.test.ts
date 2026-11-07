import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanMarkers, dedupeAdjacentMarkers, mergeAdjacentMarkers } from "./citation-cleanup.ts";

test("붙어 있는 중복 각주를 합친다", () => {
  assert.equal(dedupeAdjacentMarkers("가나.[5][5] 다라.[1][11][1] 마바.[2]"), "가나.[5] 다라.[1][11] 마바.[2]");
});
test("출처 목록에 없는 번호는 지운다", () => {
  assert.equal(cleanMarkers("근거다.[1][11][1] 계산이다.[2]", new Set([1])), "근거다.[1] 계산이다.");
  assert.equal(cleanMarkers("표기 [1] 그대로", new Set([1])), "표기 [1] 그대로");
});

test("붙어 있는 각주를 하나로 합친다", () => {
  assert.equal(mergeAdjacentMarkers("나뉘었다.[1][2]"), "나뉘었다.[1,2]");
  assert.equal(mergeAdjacentMarkers("이어졌다.[3][2]"), "이어졌다.[2,3]");
  assert.equal(mergeAdjacentMarkers("하나만.[1]"), "하나만.[1]");
  assert.equal(mergeAdjacentMarkers("셋.[3][1][2]"), "셋.[1,2,3]");
});

test("같은 번호가 겹치면 한 번만 남긴다", () => {
  assert.equal(mergeAdjacentMarkers("겹침.[2][2]"), "겹침.[2]");
});

test("떨어져 있는 각주는 합치지 않는다", () => {
  assert.equal(mergeAdjacentMarkers("가.[1] 나.[2]"), "가.[1] 나.[2]");
});
