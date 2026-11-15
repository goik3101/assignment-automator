import test from "node:test";
import assert from "node:assert/strict";
import { unwrapHardBreaks, dropDuplicateHeadings } from "./tidy-layout.ts";

test("문장 중간에서 끊긴 줄을 한 문단으로 잇는다 (과학-12)", () => {
  const t = "체육 교사가 되면 학생들에게 운동 기능뿐 아니라 \n경기에서 일어나는 현상의 원리도 알기 쉽게 설명하고 싶다. \n축구 경기에서 공이 휘어 골문에 들어가는 장면을 보며, \n발로 찬 공이 왜 곧게 날아가지 않는지 궁금했다.";
  const r = unwrapHardBreaks(t);
  assert.equal(r.content.split("\n").length, 1);
  assert.ok(r.joined >= 2);
  assert.match(r.content, /운동 기능뿐 아니라 경기에서 일어나는/);
});
test("문장이 끝난 줄·목록·소제목·표는 잇지 않는다", () => {
  const t = "첫 문장이다.\n둘째 문장이다.\n셋째 문장이다.\n\n- 항목 하나\n- 항목 둘\n\n### 소제목\n본문이다.";
  assert.equal(unwrapHardBreaks(t).content, t);
});
test("같은 소제목이 두 번이고 내용이 닮았으면 뒤쪽을 지운다 (수학-02)", () => {
  const t = "### 본인이 제일 중요하게 생각한 점\n적금은 매달 납입하므로 납입 시점과 기간을 함께 살펴야 한다는 점이 중요했다.\n\n### 다른 칸\n전혀 다른 내용이다.\n\n### 본인이 제일 중요하게 생각한 점\n적금은 매달 납입하므로 납입 시점과 기간을 함께 살펴야 한다는 점을 배웠다.";
  const r = dropDuplicateHeadings(t);
  assert.equal(r.dropped.length, 1);
  assert.equal((r.content.match(/본인이 제일/g) ?? []).length, 1);
  assert.match(r.content, /다른 칸/);
});
test("소제목이 같아도 내용이 전혀 다르면 둘 다 둔다", () => {
  const t = "### 결과\n첫째 실험은 철가루가 산소와 반응해 열을 내는 과정을 관찰했다.\n\n### 결과\n둘째 실험은 전혀 다른 용액의 색 변화를 표로 정리하고 비교했다.";
  assert.equal(dropDuplicateHeadings(t).dropped.length, 0);
});

import { dropEmptyNumberedHeading } from "./tidy-layout.ts";
test("내용 없이 이어지는 번호 소제목은 앞쪽만 지운다", () => {
  const r = dropEmptyNumberedHeading("### 컷 1\n### 장면 1\n그림 준비: 식탁\n\n### 컷 2\n### 장면 2\n내용");
  assert.deepEqual(r.dropped, ["컷 1", "컷 2"]);
  assert.equal(r.content.includes("### 장면 1"), true);
  assert.equal(r.content.includes("### 컷"), false);
});
test("번호 없는 소제목·내용이 있는 소제목은 건드리지 않는다", () => {
  const s = "### 제목\n### 내용\n본문\n\n### 컷 1\n설명\n### 컷 2\n설명";
  assert.equal(dropEmptyNumberedHeading(s).content, s);
});
