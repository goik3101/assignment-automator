import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminSessionToken, verifyAdminSessionToken, SESSION_MS } from "./session-token.ts";

process.env.ADMIN_SESSION_SECRET = "test-secret-for-session-token-tests";
const H = 60 * 60 * 1000;

test("로그인 후 8시간 동안 유효하고, 8시간이 지나면 끝난다", () => {
  const t0 = 1_000_000;
  const token = createAdminSessionToken(t0);
  assert.equal(SESSION_MS, 8 * H);
  assert.equal(verifyAdminSessionToken(token, t0 + 1000), true);
  assert.equal(verifyAdminSessionToken(token, t0 + 7 * H + 59 * 60 * 1000), true);
  assert.equal(verifyAdminSessionToken(token, t0 + 8 * H), false);
  assert.equal(verifyAdminSessionToken(token, t0 + 9 * H), false);
});

test("위조·빈 값·형식 오류는 거절", () => {
  const token = createAdminSessionToken(1000);
  assert.equal(verifyAdminSessionToken(token.replace(/.$/, (c) => (c === "a" ? "b" : "a")), 2000), false);
  assert.equal(verifyAdminSessionToken("99999999999999.deadbeef", 2000), false);
  assert.equal(verifyAdminSessionToken("", 2000), false);
  assert.equal(verifyAdminSessionToken(undefined, 2000), false);
  assert.equal(verifyAdminSessionToken("abc", 2000), false);
});

test("만료 시각을 바꿔치기한 토큰은 서명이 맞지 않아 거절", () => {
  const token = createAdminSessionToken(1000);
  const sig = token.split(".")[1];
  assert.equal(verifyAdminSessionToken(`${1000 + 100 * H}.${sig}`, 2000), false);
});
