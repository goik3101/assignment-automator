import test from "node:test";
import assert from "node:assert/strict";
import { wantsExtraMaterial, ensureExtraMaterialSlot } from "./extra-material.ts";

test("추가 자료 1개 이상 포함 요구를 읽는다(과학-01)", () => {
  assert.equal(wantsExtraMaterial(["추가 자료는 1개 이상으로 포함할 것."]), true);
  assert.equal(wantsExtraMaterial(["이미지(사진·그림)를 삽입한다."]), true);
});

test("요구가 없거나 금지·한정 문장이면 읽지 않는다", () => {
  assert.equal(wantsExtraMaterial(["참고문헌의 신뢰성을 고려할 것."]), false);
  assert.equal(wantsExtraMaterial(["사진 없이 그림만 가능하다."]), false);
});

test("본론 끝에 자리를 둔다", () => {
  const r = ensureExtraMaterialSlot("## 보고서\n\n### 서론\n서론 글.\n\n### 본론\n본론 글.\n\n### 결론\n결론 글.");
  assert.equal(r.added, true);
  assert.match(r.content, /본론 글\.\n\n\[붙일 자료:[^\]]+\]\n\n### 결론/);
});

test("본론이 없으면 결론 앞, 이미 표나 자리가 있으면 그대로", () => {
  const a = ensureExtraMaterialSlot("### 요약\n글.\n\n### 참고문헌\n- a");
  assert.match(a.content, /\[붙일 자료[^\]]+\]\n\n### 요약/);
  const t = "본문\n\n| 연도 | 값 |\n| --- | --- |\n| 2011 | 5 |";
  assert.equal(ensureExtraMaterialSlot(t).added, false);
  assert.equal(ensureExtraMaterialSlot("글\n[붙일 자료: 그래프]").added, false);
});
