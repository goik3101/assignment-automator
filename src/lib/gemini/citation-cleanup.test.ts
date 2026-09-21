import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanMarkers, dedupeAdjacentMarkers } from "./citation-cleanup.ts";

test("붙어 있는 중복 각주를 합친다", () => {
  assert.equal(dedupeAdjacentMarkers("가나.[5][5] 다라.[1][11][1] 마바.[2]"), "가나.[5] 다라.[1][11] 마바.[2]");
});
test("출처 목록에 없는 번호는 지운다", () => {
  assert.equal(cleanMarkers("근거다.[1][11][1] 계산이다.[2]", new Set([1])), "근거다.[1] 계산이다.");
  assert.equal(cleanMarkers("표기 [1] 그대로", new Set([1])), "표기 [1] 그대로");
});
