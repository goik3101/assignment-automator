import { test } from "node:test";
import assert from "node:assert/strict";
import { answersToInstructions, buildTopicQuestion, topicStillOpen, type PreAnswer } from "./questions-pure.ts";
import { findStudentTopic, isTopicQuestion } from "../selection/student-topic.ts";
import { selectionTargetWord } from "../selection/selection-need.ts";

const NEWS = {
  topic: "광복 이후 현대사 신문 만들기",
  requirements: ["광복 이후의 주요 사건 중 하나를 선정하여 신문을 제작한다.", "머리기사·인터뷰·사설·만평을 모두 포함한다."],
  task_elements: [
    { label: "머리기사", description: "선정한 사건을 기사로 쓴다.", required_items: ["제목", "내용"] },
    { label: "만평/광고", description: "사건을 풍자하는 만평을 그린다." },
  ],
};
const SCIENCE = {
  topic: "산과 염기의 성질 탐구 보고서",
  requirements: ["실험 결과를 표로 정리하고 결론을 쓴다."],
  task_elements: [{ label: "탐구 보고서", description: "실험 과정과 결과를 정리한다.", required_items: ["가설", "과정", "결과"] }],
};
const BOOK = {
  topic: "독서 감상문",
  requirements: ["읽은 책 한 권을 선정하여 감상문을 쓴다."],
  task_elements: [{ label: "감상문", description: "책을 읽고 느낀 점을 쓴다." }],
};

test("선정 과제인데 아직 아무도 정하지 않았으면 주제가 미정이다", () => {
  assert.equal(topicStillOpen({ info: NEWS, instructions: "", answers: [] }), true);
});

test("선정 과제가 아니면 주제를 묻지 않는다", () => {
  assert.equal(topicStillOpen({ info: SCIENCE, instructions: "", answers: [] }), false);
});

test("책 선정은 책 과제 전용 경로가 맡으므로 여기서 묻지 않는다", () => {
  assert.equal(topicStillOpen({ info: BOOK, instructions: "", answers: [] }), false);
});

test("학생이 지침에 이미 적었으면 묻지 않는다", () => {
  assert.equal(topicStillOpen({ info: NEWS, instructions: "주제: 5·18 민주화운동", answers: [] }), false);
  assert.equal(topicStillOpen({ info: NEWS, instructions: "사일구 혁명으로 발표할게.", answers: [] }), false);
  // 반대로 "사일구 혁명으로 할게."(무엇을 할지 말하는 낱말이 없음)는 findDeclaredTopic이 일부러 안 읽는다
  // ("내일까지 할게."를 주제로 읽는 것을 막는 장치). 그 경우 이 질문이 대신 물어 준다.
  assert.equal(topicStillOpen({ info: NEWS, instructions: "사일구 혁명으로 할게.", answers: [] }), true);
});

test("이미 주제를 물었으면 다시 묻지 않는다 — AI에게 맡김·나중에도 학생의 답이다", () => {
  const asked = (state: PreAnswer["state"]): PreAnswer[] => [
    { question: "이번 수행평가에서 어떤 사건을 다룰까요?", key: "task_subject", answer: state === "answered" ? "제주 4·3 사건" : "", state },
  ];
  for (const s of ["answered", "delegate", "later"] as const) {
    assert.equal(topicStillOpen({ info: NEWS, instructions: "", answers: asked(s) }), false, s);
  }
});

test("영역 세부 질문에 답했다고 주제가 정해진 것은 아니다 (2026-11-02 신문 사고)", () => {
  const answers: PreAnswer[] = [
    { question: "인터뷰 대상을 누구로 할까요?", key: "interview_target", answer: "당시 신문기자", state: "answered" },
  ];
  assert.equal(topicStillOpen({ info: NEWS, instructions: "", answers: answers }), true);
});

test("질문 문구는 안내문이 고르라고 한 대상 낱말을 쓴다", () => {
  assert.equal(selectionTargetWord(NEWS), "사건");
  assert.equal(buildTopicQuestion(NEWS, []).text, "이번 수행평가에서 어떤 사건을 다룰까요?");
  const person = { topic: "인물 탐구", requirements: ["존경하는 인물 한 명을 선정하여 조사한다."], task_elements: [] };
  assert.equal(buildTopicQuestion(person, []).text, "이번 수행평가에서 어떤 인물을 다룰까요?");
  // 조사(을/를)가 받침에 맞는다
  const theme = { topic: "탐구", requirements: ["탐구 주제를 정하여 발표한다."], task_elements: [] };
  assert.equal(buildTopicQuestion(theme, []).text, "이번 수행평가에서 어떤 주제를 다룰까요?");
});

test("대상 낱말이 한 영역 이름이면 '주제'로 돌린다", () => {
  const ad = { topic: "공익 광고 만들기", requirements: ["공익 광고 하나를 선정하여 분석한다."], task_elements: [] };
  assert.equal(selectionTargetWord(ad), "광고");
  assert.equal(buildTopicQuestion(ad, []).text, "이번 수행평가에서 어떤 주제를 다룰까요?");
});

test("코드가 만든 질문의 답은 생성 쪽이 되읽을 수 있어야 한다 (왕복)", () => {
  for (const info of [NEWS, { topic: "사회 문제 탐구", requirements: ["우리 사회의 사회 문제 하나를 선택한다."], task_elements: [] }]) {
    const q = buildTopicQuestion(info, []);
    assert.equal(isTopicQuestion(q.text), true, q.text);
    const merged = answersToInstructions([{ question: q.text, key: q.key, answer: "노인 빈곤 문제", state: "answered" }]);
    assert.equal(findStudentTopic(merged), "노인 빈곤 문제", q.text);
  }
});

test("코드가 만든 질문은 화면이 직접 입력·AI에게 맡김을 줄 수 있는 형태다", () => {
  const q = buildTopicQuestion(NEWS, []);
  assert.equal(q.kind, "choice"); // personal이면 화면이 "AI가 알아서"를 주지 않는다
  assert.equal(q.allowOther, true);
  assert.equal(q.key, "task_subject");
});

test("QUESTION_TOPIC_FIRST=off면 예전처럼 모델이 순서를 정한다", () => {
  process.env.QUESTION_TOPIC_FIRST = "off";
  try {
    assert.equal(topicStillOpen({ info: NEWS, instructions: "", answers: [] }), false);
  } finally {
    delete process.env.QUESTION_TOPIC_FIRST;
  }
});
