import test from "node:test";
import assert from "node:assert/strict";
import { acceptReviewedSection } from "./review-accept.ts";

const ORIG = "### 현상\n" + "물과 기름은 잘 섞이지 않는다.[1] 세제는 표면장력을 낮춘다.[2] ".repeat(10);

test("각주·수치·소제목을 새로 만들지 않고 길이가 크게 안 변하면 받는다", () => {
  assert.equal(acceptReviewedSection(ORIG, ORIG.slice(0, Math.round(ORIG.length * 0.8))).ok, true);
});
test("없던 각주·수치·소제목, 지나친 증감은 받지 않는다", () => {
  assert.equal(acceptReviewedSection(ORIG, ORIG + " 새 근거다.[9]").ok, false);
  assert.equal(acceptReviewedSection(ORIG, ORIG.slice(0, 200) + " 2023년에는 52.6%였다.").ok, false);
  assert.equal(acceptReviewedSection(ORIG, ORIG + "\n### 새 항목\n내용").ok, false);
  assert.equal(acceptReviewedSection(ORIG, "짧다").ok, false);
  assert.equal(acceptReviewedSection(ORIG, "").ok, false);
});
