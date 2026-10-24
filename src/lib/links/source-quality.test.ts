import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySourceTier } from "./source-quality.ts";

test("레포트 판매·커뮤니티는 약한 출처, 나무위키 미러는 백과·위키", () => {
  // 실측(2026-10-24): 아래 출처가 모두 "일반"으로 매겨져 핵심 근거로 쓰였다.
  assert.equal(classifySourceTier("https://www.allreport.co.kr/search/detail.asp?pk=1"), "weak");
  assert.equal(classifySourceTier("https://docs.orbi.kr/attach/public/7514"), "weak");
  assert.equal(classifySourceTier("https://www.happycampus.com/report-doc/1/"), "weak");
  assert.equal(classifySourceTier("https://www.namu.moe/w/abc"), "reference");
  assert.equal(classifySourceTier("https://www.khan.co.kr/article/1"), classifySourceTier("https://www.khan.co.kr/article/2"));
});
