import { test } from "node:test";
import assert from "node:assert/strict";
import { findUncitedFigures, uncitedFigureRepairText, valuesIn } from "./uncited-figures.ts";

// 실제 결과물(2026-10-30)에서 마지막까지 남았던 문장들.
const NOTES = [
  "전국 초미세먼지 연간 배출량은 2022년 59,459톤이었다.",
  "2024년 65세 이상 노인의 상대적 빈곤율은 35.9%였다.",
];

test("각주 없는 수치 문장만 찾고, 노트에 있는 값인지 구분한다", () => {
  const content = [
    "전국 초미세먼지 연간 배출량은 2022년 59,459톤이었다.", // 노트에 있음 → 번호만 빠짐
    "OECD 비교 기준으로 집계된 2020년 한국의 연평균 농도는 25.3㎍/㎥였다.", // 노트에 없음
    "헌법재판소는 2012년에 위헌으로 결정했다.[1]", // 각주 있음 → 대상 아님
    "나는 이 문제를 더 알아보고 싶다고 생각한다.", // 의견
    "자료는 https://example.go.kr/x 에서 확인한다.", // 주소 줄
  ].join("\n");
  const found = findUncitedFigures(content, NOTES);
  assert.equal(found.length, 2);
  assert.equal(found[0].inNotes, true);
  assert.equal(found[1].inNotes, false);
  assert.ok(found[1].values.includes("25.3㎍"));
});

test("값 표기를 정규화해서 읽는다", () => {
  // 쉼표 숫자는 단위 없이 "59459"로 정규화된다 — 노트 쪽도 같은 규칙이라 서로 맞는다.
  assert.deepEqual(valuesIn("2022년 59,459톤"), ["2022년", "59459"]);
  assert.deepEqual(valuesIn("수치 없는 문장"), []);
  // 분량·쪽수처럼 글 자체를 설명하는 숫자는 값으로 보지 않는다
  assert.deepEqual(valuesIn("800자 내외로 쓴다"), []);
});

test("보완 지시는 바꿀 방향까지 말한다", () => {
  const t = uncitedFigureRepairText(findUncitedFigures("2020년 농도는 25.3㎍/㎥였다.", NOTES));
  assert.match(t, /조사 자료에 있는 값으로 바꾸고/);
  assert.match(t, /숫자를 빼고/);
});
