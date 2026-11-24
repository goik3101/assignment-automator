import { test } from "node:test";
import assert from "node:assert/strict";
import { feedbackUserId, isFeedbackId, parseIdentity } from "./identity.ts";

test("익명이 기본이고, 계정으로 보내기는 직접 고른 로그인 사용자만 user_id가 저장된다", () => {
  assert.equal(parseIdentity(undefined), "anonymous");
  assert.equal(parseIdentity("account"), "account");
  assert.equal(parseIdentity("아무거나"), "anonymous");
  assert.equal(feedbackUserId("anonymous", false, "u1"), null); // 로그인했어도 기본은 익명
  assert.equal(feedbackUserId("account", false, "u1"), "u1");
  assert.equal(feedbackUserId("account", false, null), null); // 비로그인은 계정이 없다
});

test("개선 돕기(공유)는 계정을 골라도 user_id를 비운다", () => {
  assert.equal(feedbackUserId("account", true, "u1"), null);
});

test("피드백 id는 uuid만 받는다", () => {
  assert.equal(isFeedbackId("3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b"), true);
  assert.equal(isFeedbackId("1 or 1=1"), false);
  assert.equal(isFeedbackId(undefined), false);
});
