import { test } from "node:test";
import assert from "node:assert/strict";
import { withinLimit } from "./throttle-pure.ts";

test("동시 요청: 한도(2회) 안의 순서만 통과하고 나머지는 막는다", () => {
  // 이미 1회 쓴 사용자가 동시에 2번 요청 — 둘 다 자리를 넣은 뒤 순서를 본다.
  const ids = ["used-1", "req-a", "req-b"];
  assert.equal(withinLimit(ids, "req-a", 2), true);
  assert.equal(withinLimit(ids, "req-b", 2), false);
  assert.equal(withinLimit(ids, "missing", 2), false);
  assert.equal(withinLimit(["only"], "only", 1), true);
});
