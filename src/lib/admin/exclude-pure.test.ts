import { test } from "node:test";
import assert from "node:assert/strict";
import { excludePatterns, isExcludedEmail } from "./exclude-pure.ts";

test("제외 계정: 정확한 이메일과 * 패턴, 대소문자·공백 무시", () => {
  const p = excludePatterns(" Tester@Example.test , studed-diversity-*@example.com\nfoo@bar.com");
  assert.equal(p.length, 3);
  assert.equal(isExcludedEmail("tester@example.test", p), true);
  assert.equal(isExcludedEmail("studed-diversity-family-1@example.com", p), true);
  assert.equal(isExcludedEmail("studed-diversity-@example.com", p), true);
  assert.equal(isExcludedEmail("FOO@bar.com", p), true);
});

test("제외 계정이 아닌 것과 빈 설정은 그대로 둔다(부분 일치·점 이스케이프)", () => {
  const p = excludePatterns("tester@example.test,studed-diversity-*@example.com");
  assert.equal(isExcludedEmail("xtester@example.test", p), false);
  assert.equal(isExcludedEmail("tester@exampleXtest", p), false);
  assert.equal(isExcludedEmail("studed-diversity-a@example.org", p), false);
  assert.equal(isExcludedEmail("real.user@gmail.com", p), false);
  assert.equal(isExcludedEmail(null, p), false);
  assert.equal(isExcludedEmail("a@b.com", excludePatterns("")), false);
  assert.equal(isExcludedEmail("a@b.com", excludePatterns(undefined)), false);
});
