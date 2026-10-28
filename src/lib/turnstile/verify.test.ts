import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyTurnstile } from "./verify.ts";

function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>) {
  const keys = Object.keys(env);
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) env[k] === undefined ? delete process.env[k] : (process.env[k] = env[k]);
  return fn().finally(() => {
    for (const k of keys) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]);
  });
}

const quiet = () => {
  const warn = console.warn;
  const error = console.error;
  console.warn = () => {};
  console.error = () => {};
  return () => {
    console.warn = warn;
    console.error = error;
  };
};

test("캡차 키가 없으면 운영에서도 기본은 건너뛴다(키 없이 운영하던 방식)", async () => {
  const restore = quiet();
  try {
    await withEnv({ TURNSTILE_SECRET_KEY: undefined, NODE_ENV: "production", TURNSTILE_REQUIRED: undefined }, async () => {
      assert.equal(await verifyTurnstile(null), true);
    });
  } finally {
    restore();
  }
});

test("TURNSTILE_REQUIRED=on이면 운영에서 키가 없을 때 거절한다", async () => {
  const restore = quiet();
  try {
    await withEnv({ TURNSTILE_SECRET_KEY: undefined, NODE_ENV: "production", TURNSTILE_REQUIRED: "on" }, async () => {
      assert.equal(await verifyTurnstile("tok"), false);
    });
    // 개발 환경에서는 켜 둬도 건너뛴다
    await withEnv({ TURNSTILE_SECRET_KEY: undefined, NODE_ENV: "development", TURNSTILE_REQUIRED: "on" }, async () => {
      assert.equal(await verifyTurnstile(null), true);
    });
  } finally {
    restore();
  }
});

test("키가 있는데 토큰이 없으면 항상 거절한다", async () => {
  await withEnv({ TURNSTILE_SECRET_KEY: "secret", NODE_ENV: "production", TURNSTILE_REQUIRED: undefined }, async () => {
    assert.equal(await verifyTurnstile(null), false);
  });
});
