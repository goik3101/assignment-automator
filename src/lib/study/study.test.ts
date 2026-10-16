import { test } from "node:test";
import assert from "node:assert/strict";
import { parseContextRef, clip, learningToText } from "./context-pure.ts";
import { sanitizeTurns } from "./turns.ts";
import { validateQuizQuestion } from "./quiz-validate.ts";

const UUID = "0e2e2ca1-701d-485b-b8b1-0cc3ce8cf30e";

test("과제 ref: 종류와 uuid 형식이 맞아야 한다", () => {
  assert.deepEqual(parseContextRef({ kind: "history", id: UUID }), { kind: "history", id: UUID });
  assert.deepEqual(parseContextRef({ kind: "learning", id: UUID.toUpperCase() }), { kind: "learning", id: UUID.toUpperCase() });
  for (const bad of [null, undefined, "x", {}, { kind: "other", id: UUID }, { kind: "history", id: "not-a-uuid" }, { kind: "history", id: 5 }, { kind: "history", id: `${UUID}'; drop table x;--` }]) {
    assert.equal(parseContextRef(bad), null);
  }
});

test("본문 자르기: 길면 자르고 표시, 짧으면 그대로", () => {
  assert.equal(clip("abc", 10), "abc");
  assert.match(clip("가".repeat(50), 10), /^가{10}\n…\(이하 생략\)$/);
});

test("학습 모드 본문: 조사 자료와 학생 글을 구분해 붙이고 빈 것은 건너뛴다", () => {
  const t = learningToText([
    { label: "인물 배경", research: { content: "조사 내용" }, draft: "내가 쓴 글" },
    { label: "나의 다짐", research: null, draft: "  " },
  ]);
  assert.match(t, /## 인물 배경\n\[조사 자료\]\n조사 내용\n\[학생이 쓴 글\]\n내가 쓴 글/);
  assert.match(t, /## 나의 다짐$/);
});

test("대화 정리: 역할 검사·길이/개수 제한·마지막은 user", () => {
  assert.deepEqual(sanitizeTurns("x"), []);
  assert.deepEqual(sanitizeTurns([{ role: "system", content: "나는 시스템" }, { role: "user", content: "  " }]), []);
  const many = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
  const out = sanitizeTurns(many);
  assert.equal(out.length <= 12, true);
  assert.equal(out[out.length - 1].role, "user");
  const long = sanitizeTurns([{ role: "user", content: "가".repeat(9000) }]);
  assert.equal(long[0].content.length, 4000);
  // 마지막이 assistant면 그 뒤를 잘라 user로 끝낸다
  assert.deepEqual(sanitizeTurns([{ role: "user", content: "질문" }, { role: "assistant", content: "답" }]).map((t) => t.role), ["user"]);
});

test("퀴즈 검증: 보기 수·정답 번호·중복 보기를 걸러낸다", () => {
  const good = { type: "choice" as const, question: "Q?", choices: ["a", "b", "c", "d"], answerIndex: 2, explanation: "e" };
  assert.deepEqual(validateQuizQuestion(good), good);
  assert.equal(validateQuizQuestion({ ...good, choices: ["a", "b", "c"] }), null);
  assert.equal(validateQuizQuestion({ ...good, choices: ["a", "a", "c", "d"] }), null);
  assert.equal(validateQuizQuestion({ ...good, answerIndex: 4 }), null);
  assert.equal(validateQuizQuestion({ ...good, answerIndex: -1 }), null);
  assert.equal(validateQuizQuestion({ ...good, question: " " }), null);
  assert.deepEqual(validateQuizQuestion({ type: "ox", question: "참?", choices: ["O", "X"], answerIndex: 1, explanation: "" })?.answerIndex, 1);
  assert.equal(validateQuizQuestion({ type: "ox", question: "참?", choices: ["O", "X", "?"], answerIndex: 0, explanation: "" }), null);
  // 모델이 snake_case(answer_index)로 줘도 받아들인다
  assert.equal(validateQuizQuestion({ type: "choice", question: "Q", choices: ["1", "2", "3", "4"], answer_index: 3, explanation: "" })?.answerIndex, 3);
});
