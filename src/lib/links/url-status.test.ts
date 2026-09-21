import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyHttpStatus, classifyFetchError, toUrlValid } from "./url-status.ts";

test("404/410만 무효, 403·429·5xx는 확인 불가(죽은 링크로 단정하지 않는다)", () => {
  assert.equal(classifyHttpStatus(200), "valid");
  assert.equal(classifyHttpStatus(301), "valid");
  assert.equal(classifyHttpStatus(404), "invalid");
  assert.equal(classifyHttpStatus(410), "invalid");
  for (const s of [401, 403, 429, 451, 500, 502, 503, 504]) assert.equal(classifyHttpStatus(s), "unverifiable", String(s));
});
test("DNS 실패만 무효, 시간 초과·연결 오류는 확인 불가", () => {
  assert.equal(classifyFetchError({ cause: { code: "ENOTFOUND" } }), "invalid");
  assert.equal(classifyFetchError({ name: "AbortError" }), "unverifiable");
  assert.equal(classifyFetchError({ cause: { code: "ECONNRESET" } }), "unverifiable");
});
test("url_valid 매핑", () => {
  assert.equal(toUrlValid("valid"), true);
  assert.equal(toUrlValid("invalid"), false);
  assert.equal(toUrlValid("unverifiable"), null);
});
