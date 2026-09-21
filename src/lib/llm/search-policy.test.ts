import { test } from "node:test";
import assert from "node:assert/strict";
import { needsFactSearch } from "./search-policy.ts";

test("사실 조사가 필요한 과제는 검색을 강제한다", () => {
  assert.equal(needsFactSearch("인권 선구자의 업적 탐구", "인물 배경, 주요 활동 조사"), true);
  assert.equal(needsFactSearch("독서 감상문", "책 한 권을 골라"), true);
  assert.equal(needsFactSearch("사회문제 탐구 보고서 출처 표기"), true);
});
test("창작·계산·기획형은 검색을 강제하지 않는다", () => {
  assert.equal(needsFactSearch("신조어 만들기", "새로운 단어를 창작"), false);
  assert.equal(needsFactSearch("매주 저축액 계산", "수식과 표"), false);
  assert.equal(needsFactSearch("디지털 과의존 예방 포스터", "그림 구성"), false);
});
test("창작 표현이 있어도 조사·출처를 요구하면 검색한다 / 내용이 없으면 검색(안전한 쪽)", () => {
  assert.equal(needsFactSearch("신조어 만들기", "기존 유사 표현 조사, 출처 표기"), true);
  assert.equal(needsFactSearch(""), true);
});

test("수학·계산 중심 탐구는 '탐구'·'방법'이라는 낱말만으로 검색을 강제하지 않는다", () => {
  assert.equal(needsFactSearch("실생활 수학 탐구 보고서", "문제 설정, 변수, 계산 과정, 수식, 표, 그래프 계획, 결과, 실생활 의미", "탐구 방법을 쓰고 계산해줘"), false);
});
test("과학·사회·역사 탐구는 여전히 검색한다", () => {
  assert.equal(needsFactSearch("산업혁명이 노동자의 생활에 미친 영향 역사 탐구 보고서"), true);
  assert.equal(needsFactSearch("청소년 스마트폰 사용과 수면 문제 사회문제 탐구 보고서", "자료 조사, 출처 표기"), true);
  assert.equal(needsFactSearch("물의 온도가 설탕이 녹는 속도에 미치는 영향 실험 설계 보고서", "탐구 질문, 가설, 통제변인, 실험 방법"), true);
});
