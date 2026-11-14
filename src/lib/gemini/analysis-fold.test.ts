import test from "node:test";
import assert from "node:assert/strict";
import { foldSkeletonItems } from "./analysis-normalize.ts";

test("형식 뼈대와 내용 항목이 섞이면 뼈대만 칸으로 두고 내용은 설명으로 옮긴다(과학-01)", () => {
  const el = {
    description: "연구 보고서를 쓴다.",
    required_items: ["문제점 분석", "과학 기술 사례", "발전 방향", "서론", "본론", "결론", "참고문헌", "요약"],
  };
  const out = foldSkeletonItems(el);
  assert.deepEqual(out.required_items, ["서론", "본론", "결론", "참고문헌", "요약"]);
  assert.match(out.description, /본론에서 다룰 내용: 문제점 분석; 과학 기술 사례; 발전 방향/);
});

test("뼈대가 3개 미만이면 건드리지 않는다", () => {
  const el = { description: "비평문", required_items: ["서론", "본론", "결론"] };
  assert.equal(foldSkeletonItems(el), el);
  const el2 = { description: "x", required_items: ["제목", "내용", "서론", "본론"] };
  assert.equal(foldSkeletonItems(el2), el2);
});

test("내용 항목이 1개뿐이면 건드리지 않는다", () => {
  const el = { description: "x", required_items: ["서론", "본론", "결론", "요약", "주제"] };
  assert.equal(foldSkeletonItems(el), el);
});
