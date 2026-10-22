import { test } from "node:test";
import assert from "node:assert/strict";
import { forceTextSubmissionIfNoExternalHint as force, fallbackSubject, isSuspiciousSubject } from "./analysis-normalize.ts";

test("외부 제작 표지가 없으면 글 제출로 통일한다(표·그래프 계획, 기획서, 보고서)", () => {
  assert.equal(force({ type: "external_production", label: "표(계획/작성)", description: "주차별 저축액 표를 만든다" }, "실생활 수학 탐구 보고서").type, "text_submission");
  assert.equal(force({ type: "external_production", label: "기획서", description: "앱 서비스 기획" }, "과제 관리 앱 기획").type, "text_submission");
});
test("포스터·PPT·영상 같은 실제 외부 제작은 유지한다", () => {
  assert.equal(force({ type: "external_production", label: "포스터 제작", description: "4절 도화지에 그린다" }, "").type, "external_production");
  assert.equal(force({ type: "external_production", label: "발표 PPT", description: "슬라이드 10장" }, "").type, "external_production");
  assert.equal(force({ type: "text_submission", label: "x", description: "y" }, "").type, "text_submission");
});
test("과목 필드가 주제 문장의 첫 단어면 추정으로 대체", () => {
  assert.equal(isSuspiciousSubject("스마트폰을"), true);
  assert.equal(isSuspiciousSubject("'My"), true);
  assert.equal(isSuspiciousSubject("국어"), false);
  assert.equal(isSuspiciousSubject("통합사회"), false);
  assert.equal(fallbackSubject("스마트폰을", "신조어 창작 글"), "국어");
  assert.equal(fallbackSubject("매주", "실생활 수학 탐구 보고서"), "수학");
  assert.equal(fallbackSubject("물의", "실험 설계 보고서"), "과학");
  assert.equal(fallbackSubject("'My", "영어 발표 대본"), "영어");
  assert.equal(fallbackSubject("국어", "아무 주제"), "국어");
  assert.equal(fallbackSubject("이", "정체불명"), "수행평가");
});
test("낱말 속 '법'(방법 등)에 과목 추정이 걸리지 않는다", () => {
  assert.equal(fallbackSubject("스마트폰을", "앱 기획", "개선 방법 제시"), "정보");
  assert.equal(fallbackSubject("이", "정책 제안", "해결 방법과 대책"), "수행평가");
  assert.equal(fallbackSubject("매주", "실험 방법", "탐구 보고서"), "과학");
  assert.equal(fallbackSubject("이", "법 개정 필요성", ""), "사회");
});

test("모델이 '역사'라고 답하면 그대로 둔다(민주화 운동 카드뉴스가 '운동'·'그림' 때문에 체육·미술로 바뀌던 버그)", () => {
  assert.equal(fallbackSubject("역사", "민주화 운동 카드 뉴스", "그림과 들어갈 말"), "역사");
});

test("과목이 의심스러울 때 '민주화 운동'은 체육이 아니라 역사로 본다", () => {
  assert.equal(fallbackSubject("정보", "민주화 운동 카드 뉴스 만들기"), "정보");
  assert.equal(fallbackSubject("수행평가 안내", "민주화 운동 카드 뉴스 만들기"), "역사");
});
