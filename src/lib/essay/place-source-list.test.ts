import test from "node:test";
import assert from "node:assert/strict";
import { placeSourceList, buildSourceListSection } from "./deliverable.ts";

const LIST = buildSourceListSection("참고문헌", [{ title: "정책브리핑", url: "https://www.korea.kr/a" }]);

test("모델이 쓴 참고문헌 자리를 시스템 목록으로 바꾸고 순서를 지킨다(과학-01)", () => {
  const t = "### 결론\n끝.\n\n### 참고문헌\n[1] 지어낸 제목, 2025.\n\n### 요약\n요약 글.";
  const r = placeSourceList(t, "참고문헌", LIST);
  assert.equal(r, "### 결론\n끝.\n\n### 참고문헌\n- 정책브리핑: https://www.korea.kr/a\n\n### 요약\n요약 글.");
  assert.ok(!/지어낸/.test(r));
});

test("목록 소제목이 둘이면 첫 자리에만 두고 나머지는 지운다", () => {
  const t = "본문.\n\n### 참고문헌\n[1] a\n\n### 요약\n요약.\n\n### 참고문헌\n- b";
  const r = placeSourceList(t, "참고문헌", LIST);
  assert.equal((r.match(/### 참고문헌/g) ?? []).length, 1);
  assert.match(r, /### 요약\n요약\./);
});

test("목록 소제목이 없으면 맨 끝에 붙인다", () => {
  const r = placeSourceList("본문이다.", "참고문헌", LIST);
  assert.equal(r, `본문이다.\n\n${LIST}`);
});
