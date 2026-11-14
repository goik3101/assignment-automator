import { test } from "node:test";
import assert from "node:assert/strict";
import { echoesLabel, stripLabelEcho } from "./label-echo.ts";

test("자기 칸 이름으로 시작하는 설명 줄을 가려낸다 (2026-11-14 수학 실측)", () => {
  const label = "분석적 채점 기준표";
  assert.equal(echoesLabel("분석적 채점 기준표: ‘배점’ 열과 ‘합계’ 칸: 각 소문항별 배점을 합산하여 총 30점으로 제시하였고", label), true);
  assert.equal(echoesLabel("분석적 채점 기준표: ‘평가 요소’: 연속성·도함수 계산", label), true);
});

test("제출할 글은 건드리지 않는다", () => {
  const label = "분석적 채점 기준표";
  // 표 줄·소제목·보통 문장
  assert.equal(echoesLabel("| 문항 번호 | 평가 요소 | 배점 |", label), false);
  assert.equal(echoesLabel("### 분석적 채점 기준표", label), false);
  assert.equal(echoesLabel("각 문항은 연속성과 미분가능성을 함께 본다.", label), false);
  // 학생이 채울 기입란은 뒤가 비어 있다
  assert.equal(echoesLabel("제목:", "제목"), false);
  // 다른 칸 이름으로 시작하는 줄은 이 칸의 설명이 아니다
  assert.equal(echoesLabel("머리기사: 광복 직후의 혼란", label), false);
});

test("떼고 나면 나머지 글은 그대로 남는다", () => {
  const content = [
    "| 문항 번호 | 배점 |",
    "| --- | --- |",
    "| (1) | 8 |",
    "분석적 채점 기준표: ‘배점’ 열과 ‘합계’ 칸: 합산하여 총 30점으로 제시하였고",
  ].join("\n");
  const r = stripLabelEcho(content, "분석적 채점 기준표");
  assert.equal(r.removed.length, 1);
  assert.match(r.content, /\| \(1\) \| 8 \|/);
  assert.doesNotMatch(r.content, /총 30점/);
  // 뗄 것이 없으면 원문 그대로(참조도 그대로)
  const none = stripLabelEcho("깨끗한 글입니다.", "분석적 채점 기준표");
  assert.equal(none.content, "깨끗한 글입니다.");
  assert.equal(none.removed.length, 0);
});
