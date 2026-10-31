import { test } from "node:test";
import assert from "node:assert/strict";
import { findOutOfRange, findTimeRange, outOfRangeRepairText, timeRangeBlock } from "./time-range.ts";

test("안내문에 적힌 기간을 찾는다", () => {
  // 실제 안내문 문구(2026-11-01 사진 확인)
  const r = findTimeRange(["범위: 광복부터 대한민국 정부 수립 사이 시기(1945.8.15.~1948.8.15.)"]);
  assert.equal(r?.startYear, 1945);
  assert.equal(r?.endYear, 1948);
  assert.equal(findTimeRange(["발행 시기: 광복~대한민국 정부 수립, 1945년~1948년"])?.endYear, 1948);
  assert.equal(findTimeRange(["1919년 3월 1일부터 1945년 8월 15일까지를 소재로 한다"])?.startYear, 1919);
});

test("제출 기한·수업 일정은 다룰 기간이 아니다", () => {
  assert.equal(findTimeRange(["제출 기한은 2026년 11월 2일부터 2026년 11월 6일까지다"]), null);
  assert.equal(findTimeRange(["평가 일시: 2026.11.2.~2026.11.6."]), null);
});

test("기간이 없는 과제에서는 아무것도 하지 않는다", () => {
  for (const t of [
    ["인터넷 실명제 도입에 반대하는 입장에서 발표한다"],
    ["산·염기 물질의 특징을 구별하고 중화반응을 탐구한다"],
    [undefined, ""],
  ])
    assert.equal(findTimeRange(t as (string | undefined)[]), null, JSON.stringify(t));
  assert.equal(timeRangeBlock(null), "");
  assert.deepEqual(findOutOfRange("1954년 9월까지 이어졌다.", null), []);
});

test("범위 밖 연도를 쓴 문장을 찾는다", () => {
  const range = findTimeRange(["범위: 1945.8.15.~1948.8.15."])!;
  const hits = findOutOfRange(
    [
      "1948년 4월 3일 남로당 제주도당을 중심으로 한 무장대가 봉기했다.",
      "1947년 3월 1일 경찰 발포사건을 기점으로 한 저항부터 1954년 9월 21일까지의 충돌을 포함한다.",
      "미군정은 1945년 9월 9일부터 남한의 행정권을 장악했다.",
    ].join("\n"),
    range
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].year, 1954);
});

test("출처 목록 줄과 표는 보지 않는다", () => {
  const range = findTimeRange(["범위: 1945.8.15.~1948.8.15."])!;
  assert.deepEqual(findOutOfRange("- 2003년 보고서 제목: https://example.com\n| 2011년 | 자료 |\n### 1954년 소제목", range), []);
});

test("같은 연도는 한 번만 알린다", () => {
  const range = findTimeRange(["범위: 1945.8.15.~1948.8.15."])!;
  const hits = findOutOfRange("1954년에 끝났다고 한다.\n그 뒤 1954년까지 이어졌다는 설명도 있다.", range);
  assert.equal(hits.length, 1);
});

test("블록과 보완 지시는 시점과 범위를 함께 말한다", () => {
  const range = findTimeRange(["범위: 1945.8.15.~1948.8.15."])!;
  const b = timeRangeBlock(range);
  assert.ok(b.includes("1945.8.15.~1948.8.15"), b.slice(0, 80));
  assert.ok(b.includes("이미 아는 것처럼"));
  const t = outOfRangeRepairText(range, [{ year: 1954, text: "1954년 9월 21일까지의 충돌" }]);
  assert.ok(t.includes("1954년"));
  assert.ok(t.includes("각주"));
});
