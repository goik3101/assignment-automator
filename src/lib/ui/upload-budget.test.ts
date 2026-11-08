import { test } from "node:test";
import assert from "node:assert/strict";
import { LADDER, MAX_REQUEST_BASE64, UPLOAD_BUDGET, chooseLadderStep, fitToBudget } from "./upload-budget.ts";

// 실제 휴대폰 사진(4000x3000, 1.2~3.7MB) 4장을 긴 변 2048px·JPEG 85%로 줄였을 때 base64 크기(2026-11-04 실측): 0.72·0.33·0.69·0.81MB → 합 2.44MB.
const MB = 1024 * 1024;

// 사진 한 장의 크기를 "긴 변 e, 품질 q"에서 어림하는 가짜 인코더 — 크기는 면적(e²)과 품질에 비례한다고 본다.
function fakeEncoder(baseAt2048q85: number[]) {
  return (i: number, step: number) => {
    const { edge, quality } = LADDER[step];
    return Math.round(baseAt2048q85[i] * (edge / 2048) ** 2 * (quality / 0.85));
  };
}

test("재현: 수정 전 방식(1.5MB 이하 사진은 원본 그대로)이면 4장이 한도(4.5MB)를 넘는다", () => {
  // KakaoTalk 등으로 받은 1280~2000px, 1.1~1.4MB 사진 4장: 줄이지 않으면 base64로 각 1.5~1.9MB.
  const raw = [1.2, 1.3, 1.1, 1.4].map((m) => Math.round(m * MB * (4 / 3)));
  const total = raw.reduce((a, b) => a + b, 0);
  assert.ok(total > 4.5 * MB, `원본 그대로 보내면 ${(total / MB).toFixed(2)}MB`);
  assert.ok(total > MAX_REQUEST_BASE64);
});

test("예산 안이면 첫 단계(가장 선명한 설정) 그대로 쓴다", () => {
  assert.equal(chooseLadderStep([2.44 * MB, 1.7 * MB, 1.2 * MB]), 0);
  assert.equal(chooseLadderStep([UPLOAD_BUDGET, 1, 1]), 0);
});

test("예산을 넘으면 처음으로 예산 안에 들어오는 단계를 고른다", () => {
  assert.equal(chooseLadderStep([6.5 * MB, 5 * MB, 3.2 * MB, 2.5 * MB]), 2);
});

test("끝까지 못 줄이면 마지막 단계(가장 작은 설정)를 쓴다", () => {
  assert.equal(chooseLadderStep([9 * MB, 8 * MB, 7 * MB]), 2);
});

test("수정 후: 원본이 큰 사진 4장도 합계가 예산 안으로 들어온다", () => {
  const encoder = fakeEncoder([1.9 * MB, 2.0 * MB, 1.8 * MB, 2.1 * MB]); // 2048px·q85에서 이미 합 7.8MB인 무거운 사진
  const { step, total, sizes } = fitToBudget(4, encoder);
  assert.ok(total <= UPLOAD_BUDGET, `합계 ${(total / MB).toFixed(2)}MB`);
  assert.equal(sizes.length, 4);
  assert.ok(step > 0); // 첫 단계로는 안 들어와서 줄였다
  assert.ok(step < LADDER.length);
});

test("한 장이거나 가벼운 4장은 줄이지 않는다(글씨를 흐리게 하지 않는다)", () => {
  assert.equal(fitToBudget(1, () => 3 * MB).step, 0);
  assert.equal(fitToBudget(4, fakeEncoder([0.7 * MB, 0.3 * MB, 0.7 * MB, 0.8 * MB])).step, 0);
});

test("사다리는 큰 설정에서 작은 설정 순이고 읽을 수 있는 최소 크기를 지킨다", () => {
  for (let i = 1; i < LADDER.length; i++) {
    assert.ok(LADDER[i].edge < LADDER[i - 1].edge);
    assert.ok(LADDER[i].quality <= LADDER[i - 1].quality);
  }
  assert.ok(LADDER[LADDER.length - 1].edge >= 1200); // 인쇄된 안내문 글씨를 읽으려면 긴 변 1200px 밑으로는 내리지 않는다
  assert.ok(UPLOAD_BUDGET < 4.5 * MB); // 4.5MB 한도에서 JSON·지침·쿠키 여유
});
