import { test } from "node:test";
import assert from "node:assert/strict";
import { stripAdminLeak, isScoringStep } from "./admin-leak.ts";

test("배점 안내 줄을 지운다 (2026-11-11 수학 실측)", () => {
  const r = stripAdminLeak("### 문제\n(총 30점, 기본점수 10점 포함)\n\n(1) 구간에서 넓이를 구하시오. (12점)");
  assert.equal(r.removed.length, 1);
  assert.match(r.content, /### 문제/);
  assert.doesNotMatch(r.content, /기본점수/);
  // 학생이 쓴 문항의 배점은 그대로 남는다.
  assert.match(r.content, /\(12점\)/);
});

test("소제목의 차시 표시만 떼고 칸 이름은 남긴다 (2026-11-11 과학 실측)", () => {
  const r = stripAdminLeak("## 1차시 멸치해부실험\n내용\n\n## 2차시 탐구 보고서\n내용");
  assert.match(r.content, /## 멸치해부실험/);
  assert.match(r.content, /## 탐구 보고서/);
  assert.doesNotMatch(r.content, /차시/);
});

test("수업 운영 안내를 지운다", () => {
  const r = stripAdminLeak("시험 대형으로 책상 간격을 띄운다.\n부정행위 적발 시 최하점을 부여한다.\n실시일 : 8월 24일 ~ 8월 26일\n본문은 그대로 남는다.");
  assert.equal(r.removed.length, 3);
  assert.match(r.content, /본문은 그대로 남는다/);
});

test("채점 기준을 만드는 칸에서는 배점이 내용이다", () => {
  assert.equal(isScoringStep("분석적 채점 기준표", ["문항 번호", "배점"]), true);
  assert.equal(isScoringStep("수리논술 문항", ["제시문 및 조건", "문제"]), false);
  const line = "배점: 각 항목 4점씩 배분한다";
  assert.equal(stripAdminLeak(line, { keepScoring: true }).removed.length, 0);
  assert.equal(stripAdminLeak(line).removed.length, 1);
  // 차시·시험 대형은 채점 칸에서도 지운다.
  assert.equal(stripAdminLeak("시험 대형으로 앉는다.", { keepScoring: true }).removed.length, 1);
});

test("표 줄은 건드리지 않는다", () => {
  const table = "| 평가 요소 | 배점 |\n| --- | --- |\n| 계산 정확성 | 4점 |";
  assert.equal(stripAdminLeak(table).content, table);
});

test("멀쩡한 글은 한 줄도 지우지 않는다", () => {
  const body = "## 머리기사\n\n1945년 광복 직후 서울에서는 식량 배급이 큰 문제였다.[1]\n\n### 인터뷰\n\n당시 상인은 물가가 올랐다고 말했다.[2]";
  const r = stripAdminLeak(body);
  assert.equal(r.removed.length, 0);
  assert.equal(r.content, body);
});
