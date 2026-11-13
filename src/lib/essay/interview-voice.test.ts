import { test } from "node:test";
import assert from "node:assert/strict";
import { isInterviewStep, soundsSpoken, answerBlocks, reportLikeAnswers } from "./interview-voice.ts";

test("인터뷰 칸을 알아본다", () => {
  assert.equal(isInterviewStep("인터뷰"), true);
  assert.equal(isInterviewStep("인터뷰 / 대담"), true);
  assert.equal(isInterviewStep("머리기사"), false);
  assert.equal(isInterviewStep("사설 / 칼럼"), false);
});

test("기사처럼 쓴 답변을 가려낸다 (2026-11-13 실측, 3회 연속 실패한 글)", () => {
  const real = "미·영·소 외상이 1945년 12월 모여 전후 처리를 논의했다.[1] 한국에는 최대 5년 신탁통치안이 포함됐다.[1]";
  assert.equal(soundsSpoken(real), false);
});

test("사람이 말하는 답변은 통과한다", () => {
  assert.equal(soundsSpoken("그날 아침 저는 라디오를 들었습니다. 무슨 말인지 몰라 이웃집으로 뛰어갔어요."), true);
  assert.equal(soundsSpoken("쌀값이 올라 걱정이 컸지요. 그래서 배급소 앞에 새벽부터 줄을 섰습니다."), true);
  // 1인칭이 있으면 평서형이 섞여 있어도 사람의 말로 본다
  assert.equal(soundsSpoken("저는 그때 열일곱이었다. 무서웠지만 나가 봤습니다."), true);
});

test("답변 소제목 아래 글만 본다 — 질문과 다른 칸은 건드리지 않는다", () => {
  const content = [
    "### 인터뷰 대상",
    "서울에 살던 상인입니다.",
    "### 질문1",
    "그때 어떻게 지내셨나요?",
    "### 답변1",
    "모스크바 삼상회의가 열렸다. 신탁통치안이 논의됐다.",
    "### 질문2",
    "무엇이 가장 힘드셨나요?",
    "### 답변2",
    "쌀을 구하기가 어려웠습니다. 그래서 새벽마다 줄을 섰어요.",
  ].join("\n");
  const blocks = answerBlocks(content);
  assert.deepEqual(blocks.map((b) => b.heading), ["답변1", "답변2"]);
  assert.deepEqual(reportLikeAnswers(content), ["답변1"]);
});

test("빈 답변은 여기서 잡지 않는다 (분량 바닥 검사가 본다)", () => {
  assert.equal(soundsSpoken(""), true);
  assert.deepEqual(reportLikeAnswers("### 답변1\n\n### 질문2"), []);
});
