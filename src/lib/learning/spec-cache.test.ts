import { test } from "node:test";
import assert from "node:assert/strict";
import { createSpecCache, specCacheKey, specCacheOn } from "./spec-cache.ts";

const withEnv = (v: string | undefined, fn: () => void) => {
  const old = process.env.SUBJECT_SPEC_CACHE;
  if (v === undefined) delete process.env.SUBJECT_SPEC_CACHE;
  else process.env.SUBJECT_SPEC_CACHE = v;
  try {
    fn();
  } finally {
    if (old === undefined) delete process.env.SUBJECT_SPEC_CACHE;
    else process.env.SUBJECT_SPEC_CACHE = old;
  }
};

test("같은 안내문·같은 지침이면 같은 열쇠, 하나라도 다르면 다른 열쇠", () => {
  const a = specCacheKey(["한국사", '{"topic":"현대사 신문"}', ""]);
  assert.equal(a, specCacheKey(["한국사", '{"topic":"현대사 신문"}', ""]));
  // 지침에 대상이 적히면 결과가 달라진다 — 열쇠도 달라야 한다
  assert.notEqual(a, specCacheKey(["한국사", '{"topic":"현대사 신문"}', "전태일로 할게"]));
  assert.notEqual(a, specCacheKey(["한국사", '{"topic":"카드뉴스"}', ""]));
  assert.notEqual(a, specCacheKey(["과학", '{"topic":"현대사 신문"}', ""]));
});

test("두 번째 학생은 캐시에서 받는다", () => {
  withEnv(undefined, () => {
    const cache = createSpecCache<{ subject_type: string }>();
    const key = specCacheKey(["한국사", "info", ""]);
    assert.equal(cache.get(key), undefined);
    cache.set(key, { subject_type: "event" });
    assert.deepEqual(cache.get(key), { subject_type: "event" });
  });
});

test("6시간이 지난 것은 버린다", () => {
  withEnv(undefined, () => {
    let t = 1_000_000;
    const cache = createSpecCache<number>(() => t);
    cache.set("k", 7);
    t += 5 * 60 * 60 * 1000;
    assert.equal(cache.get("k"), 7);
    t += 2 * 60 * 60 * 1000;
    assert.equal(cache.get("k"), undefined);
  });
});

test("안내문이 많아지면 오래된 것부터 버린다(메모리 상한)", () => {
  withEnv(undefined, () => {
    const cache = createSpecCache<number>();
    for (let i = 0; i < 250; i++) cache.set(`k${i}`, i);
    assert.ok(cache.size <= 200, `상한을 넘었다: ${cache.size}`);
    assert.equal(cache.get("k0"), undefined);
    assert.equal(cache.get("k249"), 249);
  });
});

test("스위치를 끄면 캐시가 전혀 동작하지 않는다", () => {
  withEnv("off", () => {
    assert.equal(specCacheOn(), false);
    const cache = createSpecCache<number>();
    cache.set("k", 1);
    assert.equal(cache.get("k"), undefined);
    assert.equal(cache.size, 0);
  });
});
