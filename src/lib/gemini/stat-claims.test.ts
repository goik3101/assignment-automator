import { test } from "node:test";
import assert from "node:assert/strict";
import { collectUserNumbers, findStatClaimCandidates, classifyStatSentence } from "./stat-claims.ts";

const user = collectUserNumbers("매주 5000원씩 저축한다고 가정하고 계산해줘", "하루 2시간 공부, 앱 사용자 100명 가정");
const find = (c: string, strict = false) => findStatClaimCandidates(c, { userNumbers: user, strictExternalOnly: strict }).map((x) => x.sentence);

test("제목·소제목 줄은 통계 주장 후보가 아니다(실측 사고: 제목 줄에 검색 6회)", () => {
  assert.deepEqual(find("### 문제 설정 — 매주 5,000원 저축의 연간 누적액 계산\n\n본문입니다."), []);
});
test("사용자가 준 가정값 서술은 검증하지 않는다", () => {
  assert.deepEqual(find("매주 5,000원을 저축한다고 가정한다."), []);
  assert.deepEqual(find("앱 사용자가 100명이라고 가정하면 화면 수를 정한다."), []);
});
test("계산 과정·표·수식의 결과값은 검증하지 않는다", () => {
  assert.deepEqual(find("5,000원 × 52주 = 260,000원이다."), []);
  assert.deepEqual(find("| 1주차 | 5,000원 | 5,000원 |"), []);
  assert.deepEqual(find("연간 누적액은 260,000원으로 합계된다."), []);
});
test("가정값과 같은 숫자여도 외부 자료를 근거로 든 주장은 검증 대상이다", () => {
  assert.equal(find("통계청 조사에 따르면 청소년의 월평균 용돈은 5,000원이다.").length, 1);
  assert.equal(find("한국 청소년의 평균 저축액은 100명 중 5명 수준이다.").length, 1);
});
test("가정·계산 표지가 없는 출처 불명 수치 서술은 검증 대상이다(애매하면 검증)", () => {
  assert.equal(find("우리나라 청소년의 70%가 저축을 하지 않는다.").length, 1);
});
test("계산·창작·기획형(strict)에서는 외부 자료 표지가 명시된 문장만 검증한다", () => {
  assert.deepEqual(find("우리나라 청소년의 70%가 저축을 하지 않는다.", true), []);
  assert.equal(find("통계청 조사에 따르면 청소년의 70%가 저축을 하지 않는다.", true).length, 1);
});
test("분류", () => {
  assert.equal(classifyStatSentence("## 3주차 5,000원", user), "structure");
});
test("화면·데이터 예시 값은 외부 통계가 아니다(실측: '진행률 바(예: 60% 완료)'가 검증 검색을 유발)", () => {
  assert.deepEqual(find("- 진행률 바(예: 60% 완료)로 남은 과제를 보여 준다."), []);
  assert.deepEqual(find("예를 들어 사용자 30명이 동시에 접속하는 상황을 본다."), []);
  assert.equal(find("연구에 따르면 10~19세 청소년의 약 40%가 스마트폰 과의존 위험군이다.").length, 1);
});
