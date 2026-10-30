import test from "node:test";
import assert from "node:assert/strict";
import { findStudentTopic, isMediumOnly } from "./student-topic.ts";
import { answersToInstructions } from "../questions/questions-pure.ts";

test("제작 전 질문 답변에서 주제를 찾고, 매체 답은 주제로 보지 않는다", () => {
  // 실측: 주제·매체를 함께 답했을 때 매체("슬라이드…")가 학생이 고른 대상으로 잡혔다.
  const inst = answersToInstructions([
    { question: "어떤 매체를 활용해 발표할까요?", answer: "슬라이드(파워포인트/구글슬라이드)", state: "answered" },
    { question: "발표 주제는 무엇으로 할까요?", answer: "청소년 SNS 사용 시간 제한 찬성", state: "answered" },
  ]);
  assert.equal(findStudentTopic(inst), "청소년 SNS 사용 시간 제한 찬성");
});

test("항목 줄(발표 주제: …)과 인물 질문도 찾는다", () => {
  assert.equal(findStudentTopic("발표 주제: 인터넷 실명제 반대\n활용 매체: 슬라이드(파워포인트/구글슬라이드)"), "인터넷 실명제 반대");
  const inst = answersToInstructions([{ question: "어떤 인물을 탐구할까요?", answer: "라울 발렌베리", state: "answered" }]);
  assert.equal(findStudentTopic(inst), "라울 발렌베리");
});

test("나중에 쓰기·AI에게 맡김·입장만·책 질문은 주제로 보지 않는다", () => {
  const inst = answersToInstructions([
    { question: "어떤 주제로 발표할까요?", answer: "", state: "delegate" },
    { question: "찬반 중 어느 입장인가요?", answer: "반대", state: "answered" },
    { question: "어떤 책을 다룰까요?", answer: "데미안", state: "answered" },
  ]);
  assert.equal(findStudentTopic(inst), null);
  assert.equal(findStudentTopic(""), null);
  assert.equal(findStudentTopic("주제: 반대"), null);
});

test("매체 이름만 있는 값 판별", () => {
  assert.equal(isMediumOnly("슬라이드(파워포인트/구글슬라이드)"), true);
  assert.equal(isMediumOnly("PPT"), true);
  assert.equal(isMediumOnly("인터넷 실명제 반대"), false);
  assert.equal(isMediumOnly("신문 기사 속 혐오 표현"), false);
});

import { cleanSubjectName } from "./student-topic.ts";
test("말하듯 쓴 주제에서 대화 말꼬리를 뗀다(실측 2026-10-31)", () => {
  assert.equal(cleanSubjectName("노인 빈곤과 기초연금 문제로 할게."), "노인 빈곤과 기초연금 문제");
  assert.equal(cleanSubjectName("세종대왕으로 하고 싶어요"), "세종대왕");
  assert.equal(cleanSubjectName("미세먼지 문제를 쓸게요!"), "미세먼지 문제");
  assert.equal(cleanSubjectName("4·19 혁명"), "4·19 혁명");
  assert.equal(cleanSubjectName("인터넷 실명제"), "인터넷 실명제");
});
