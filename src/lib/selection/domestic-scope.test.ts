import test from "node:test";
import assert from "node:assert/strict";
import { isDomesticScope } from "./domestic-scope.ts";
import { itemMatchesHeading } from "../research/research-items.ts";

test("한국사·우리 사회 과제만 한국 범위로 본다", () => {
  // 실측: "1945.8.15~1948.8.15 현대사 신문"(과목 역사) — 외국 사건(체코 쿠데타)이 뽑혔다.
  assert.equal(isDomesticScope("역사", ["1945년 8월 15일부터 1948년 8월 15일까지의 역사적 사실을 바탕으로 현대사 신문 만들기"]), true);
  assert.equal(isDomesticScope("사회", ["우리 사회의 청년 주거 문제 해결 방안"]), true);
  assert.equal(isDomesticScope("사회", ["인권 선구자의 업적 탐구를 통한 저널 제작"]), false);
  assert.equal(isDomesticScope("역사", ["세계 여러 나라의 독립운동 비교"]), false);
  assert.equal(isDomesticScope("영어", ["발명품 분석"]), false);
});

test("'A 또는 B' 항목은 어느 쪽 소제목이든 있으면 채운 것으로 본다", () => {
  assert.equal(itemMatchesHeading("주제 또는 상품", "주제"), true);
  assert.equal(itemMatchesHeading("주제 또는 상품", "광고 상품"), true);
  assert.equal(itemMatchesHeading("주제 또는 상품", "특성"), false);
  assert.equal(itemMatchesHeading("특성", "특성"), true);
});
