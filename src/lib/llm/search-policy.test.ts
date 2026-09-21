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
