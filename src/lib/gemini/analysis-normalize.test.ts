import { test } from "node:test";
import assert from "node:assert/strict";
import { dropInterrogativeItems, forceTextSubmissionIfNoExternalHint as force, fallbackSubject, isInterrogativeItemList, isSuspiciousSubject } from "./analysis-normalize.ts";

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
  assert.equal(fallbackSubject("이", "정체불명"), "과제");
});
test("낱말 속 '법'(방법 등)에 과목 추정이 걸리지 않는다", () => {
  assert.equal(fallbackSubject("스마트폰을", "앱 기획", "개선 방법 제시"), "정보");
  assert.equal(fallbackSubject("이", "정책 제안", "해결 방법과 대책"), "과제");
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

test("5W1H 안내는 칸 목록이 아니다", () => {
  // 실측(결과물.10): 채점 기준의 "누가·언제·어디서·무엇을·어떻게·왜"가 머리기사의 소제목 여섯 개가 됐다.
  assert.equal(isInterrogativeItemList(["누가", "언제", "어디서", "무엇을", "어떻게", "왜"]), true);
  assert.equal(isInterrogativeItemList(["누가", "언제", "어디서", "사건의 영향"]), true);
  assert.deepEqual(dropInterrogativeItems({ label: "머리기사", required_items: ["누가", "언제", "어디서", "무엇을"] }), { label: "머리기사" });
});

test("진짜 칸 목록은 그대로 둔다", () => {
  for (const items of [
    ["인터뷰 대상", "질문 1", "답변 1", "질문 2", "답변 2"],
    ["글의 목적·주제·예상 독자", "중심 내용과 세부 내용", "뒷받침 정보", "출처"],
    ["산염기의 특징", "실험과정", "혼합 용액의 온도 변화", "지시약의 색 변화"],
    ["무엇을 배웠는가", "왜 중요한가"],
  ])
    assert.equal(isInterrogativeItemList(items), false, JSON.stringify(items));
  const el = { label: "인터뷰", required_items: ["인터뷰 대상", "질문 1", "답변 1"] };
  assert.deepEqual(dropInterrogativeItems(el), el);
});

test("항목이 하나거나 없으면 건드리지 않는다", () => {
  assert.equal(isInterrogativeItemList(["누가"]), false);
  assert.equal(isInterrogativeItemList(undefined), false);
});
