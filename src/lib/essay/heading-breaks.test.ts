import { test } from "node:test";
import assert from "node:assert/strict";
import { restoreHeadingBreaks } from "./heading-breaks.ts";

const ORIGINAL = "### 첫째 칸\n내용 하나\n\n### 둘째 칸\n내용 둘";

test("보완이 한 줄로 붙인 소제목을 줄 처음으로 되돌린다(수학-01 실제 꼴)", () => {
  const flat = "### 첫째 칸 내용 하나 ### 둘째 칸 내용 둘 ### 셋째 칸 내용 셋";
  const r = restoreHeadingBreaks(ORIGINAL, flat);
  assert.equal(r.fixed, 2);
  assert.equal(r.content.split("\n").filter((l) => l.startsWith("### ")).length, 3);
  assert.ok(!/\S ### /.test(r.content));
});

test("이미 줄이 나뉜 글과, 원문에 소제목이 없던 글은 건드리지 않는다", () => {
  assert.deepEqual(restoreHeadingBreaks(ORIGINAL, ORIGINAL), { content: ORIGINAL, fixed: 0 });
  const plain = "소제목 없는 글 ### 본문 안의 표시";
  assert.deepEqual(restoreHeadingBreaks("소제목 없는 글", plain), { content: plain, fixed: 0 });
});

test("'C# 언어'처럼 뒤에 공백·글자가 이어지지 않는 # 한 개는 건드리지 않는다", () => {
  const t = "### 언어\nC# 언어와 F# 언어를 비교한다";
  assert.equal(restoreHeadingBreaks(t, t).fixed, 0);
});
