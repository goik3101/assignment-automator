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
  // 양식지의 진짜 칸이 섞여 있으면 그것만 남긴다(실측: 제목·내용까지 함께 사라져 머리기사가 칸 없이 생성됐다).
  assert.deepEqual(
    dropInterrogativeItems({ label: "머리기사", required_items: ["제목", "내용", "누가", "언제", "어디서", "무엇을", "어떻게", "왜"] }),
    { label: "머리기사", required_items: ["제목", "내용"] }
  );
  // 남는 칸이 하나뿐이면 구조화할 것이 없다 — 목록을 버린다.
  assert.deepEqual(dropInterrogativeItems({ label: "기사", required_items: ["제목", "누가", "언제", "왜"] }), { label: "기사" });
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

test("과제 제목의 '만들기'는 외부 제작 신호가 아니다", () => {
  // 실측(2026-11-01): topic이 "…현대사 신문 만들기"라 머리기사가 external_production으로 남아 기사 글이 생성되지 않았다.
  const head = { type: "external_production", label: "머리기사", description: "신문 형식에 맞춰 제목과 내용을 작성하고, 사진·그림·지도 중 하나를 준비해 배치한다." };
  assert.equal(force(head, "광복부터 대한민국 정부 수립까지의 시기를 소재로 현대사 신문 만들기").type, "text_submission");
  assert.equal(force({ ...head, label: "감상문" }, "독서 감상문 만들기").type, "text_submission");
});

test("제목에 도구·물건 이름이 있으면 그대로 외부 제작으로 둔다", () => {
  const el = { type: "external_production", label: "결과물", description: "내용을 정리해 만든다." };
  for (const topic of ["카드뉴스 만들기", "PPT로 발표 자료 만들기", "홍보 포스터 제작", "UCC 영상 만들기"])
    assert.equal(force(el, topic).type, "external_production", topic);
});

test("단계 설명에 외부 제작 신호가 있으면 제목과 무관하게 둔다", () => {
  const el = { type: "external_production", label: "홍보물", description: "캔바로 포스터를 제작한다." };
  assert.equal(force(el, "우리 반 캠페인").type, "external_production");
});

import { ensureQuestionSteps, questionGroupsFromMaterials } from "./analysis-normalize.ts";

const QUIZ = [
  "유전체 분석 기술 의견 자료: 유전체 분석 기술이란 …",
  "탐구 확인 문제 1: 옳은 것은 ○, 옳지 않은 것은 X로 표시하시오. (1) … (2) …",
  "탐구 확인 문제 2: 옳은 것만 보기에서 고르시오. 보기 ㄱ. … ㄴ. …",
];

test("문항 자료는 번호를 뗀 이름으로 한 묶음이 된다(지문 자료는 제외)", () => {
  assert.deepEqual(questionGroupsFromMaterials(QUIZ), ["탐구 확인 문제"]);
  assert.deepEqual(questionGroupsFromMaterials(["사례1(뉴스): 청년 근로자들의 …", "통계표: 12% 40%"]), []);
});
test("문항에 답할 단계가 없으면 글 단계를 붙이고, 있으면 건드리지 않는다", () => {
  const els = [{ type: "text_submission", label: "입장 정하기", description: "입장을 정한다" }];
  const r = ensureQuestionSteps(els, QUIZ);
  assert.deepEqual(r.added, ["탐구 확인 문제"]);
  assert.equal(r.steps.length, 2);
  assert.equal(r.steps[1].type, "text_submission");
  const had = [...els, { type: "text_submission", label: "탐구 확인 문제", description: "○×로 답한다" }];
  assert.equal(ensureQuestionSteps(had, QUIZ).added.length, 0);
  // 설명에만 이름이 있어도 이미 다루는 것으로 본다(띄어쓰기 무시)
  const inDesc = [{ type: "text_submission", label: "마무리", description: "탐구확인문제에 답한다" }];
  assert.equal(ensureQuestionSteps(inDesc, QUIZ).added.length, 0);
});

import { dropNonSubmissionActivities, dropNote, isOptionalActivity, isTranscriptionStep } from "./analysis-normalize.ts";

test("희망자만 하는 활동은 필수 결과물이 아니다(정보-01 발표 자료 60초 사례) — '희망 진로'는 해당 없음", () => {
  assert.equal(isOptionalActivity({ label: "발표 자료", description: "희망자만 발표한다. 슬라이드 5~10장" }), true);
  // 설명엔 없어도 요구사항 한 줄이 그 단계 이름("발표")과 함께 "희망자만"이라고 하면 선택 활동이다(실제 정보-01 분석)
  assert.equal(isOptionalActivity({ label: "발표 자료", description: "슬라이드 5~10장" }, ["발표는 희망자만 참여하며 팀당 5분"]), true);
  // 요구사항의 "희망자만"이 다른 단계 얘기면 보지 않는다
  assert.equal(isOptionalActivity({ label: "탐구 보고서", description: "보고서를 쓴다" }, ["발표는 희망자만 참여하며 팀당 5분"]), false);
  assert.equal(isOptionalActivity({ label: "발표", description: "발표 준비" }, ["발표는 희망자만 참여한다"]), true);
  assert.equal(isOptionalActivity({ label: "진로 탐색 보고서", description: "희망 진로를 조사한다" }), false);
  assert.equal(isOptionalActivity({ label: "탐구 보고서", description: "쉬운 언어로 쓴다" }), false);
});
test("앞 단계 글을 옮겨 입력하는 단계는 새 결과물이 아니다(과학-08 PPT 65초 사례)", () => {
  assert.equal(isTranscriptionStep({ label: "3차시 PPT 슬라이드", description: "작성한 포트폴리오를 토대로 PPT슬라이드에 입력" }), true);
  assert.equal(isTranscriptionStep({ label: "3차시 입력", description: "작성한 포트폴리오를 토대로 슈퍼스쿨에 입력" }), true);
  assert.equal(isTranscriptionStep({ label: "발표 PPT", description: "슬라이드 10장을 새로 만든다" }), false);
});
test("뺄 단계가 있으면 이유를 남기고, 그것밖에 없으면 그대로 둔다", () => {
  const els = [
    { label: "탐구 보고서", description: "쉬운 언어로 보고서를 쓴다" },
    { label: "발표 자료", description: "희망자만 발표한다." },
  ];
  const r = dropNonSubmissionActivities(els, []);
  assert.deepEqual(r.kept.map((e) => e.label), ["탐구 보고서"]);
  assert.match(dropNote(r.dropped[0]), /선택 활동\(희망자만\)/);
  assert.equal(dropNonSubmissionActivities([els[1]], []).kept.length, 1);
});
