import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STUDY_PREFS, prefsSignature, quizTypePlan, sanitizeFlashcardPrefs, sanitizeQuizPrefs, sanitizeStudyPrefs, sanitizeSummaryPrefs } from "./prefs.ts";
import { isTextAnswerCorrect, validateQuizQuestion } from "./quiz-validate.ts";

test("AI 설정: 잘못된 값은 기본값으로, 개수는 범위 안으로", () => {
  assert.deepEqual(sanitizeStudyPrefs(null), DEFAULT_STUDY_PREFS);
  assert.deepEqual(sanitizeQuizPrefs({ types: ["ox", "nope"], difficulty: "hard", depth: "deep", count: 99 }), {
    types: ["ox"],
    difficulty: "hard",
    depth: "deep",
    count: 30,
  });
  assert.deepEqual(sanitizeQuizPrefs({ types: [], count: 0 }).types, DEFAULT_STUDY_PREFS.quiz.types);
  assert.equal(sanitizeQuizPrefs({ count: 0 }).count, 1);
  assert.equal(sanitizeFlashcardPrefs({ count: 80 }).count, 50);
  assert.equal(sanitizeFlashcardPrefs({ count: "abc" }).count, 10);
  // 예전 화면이 보내던 { count } 만 있는 요청도 받아 준다.
  assert.equal(sanitizeQuizPrefs({ count: 6 }).count, 6);
  assert.deepEqual(sanitizeSummaryPrefs({ detail: "detailed", format: "prose", easy: "yes" }), { detail: "detailed", format: "prose", easy: false });
});

test("설정이 다르면 서명도 다르다", () => {
  const a = sanitizeQuizPrefs({ count: 5 });
  assert.equal(prefsSignature(a), prefsSignature(sanitizeQuizPrefs({ count: 5 })));
  assert.notEqual(prefsSignature(a), prefsSignature(sanitizeQuizPrefs({ count: 6 })));
});

test("문제 유형별 문항 수 나누기", () => {
  // 2026-11-13: 고르게 나누던 것을 **비중**으로 바꿨다. 한 유형을 끄면 남은 것끼리 비중대로 나눈다.
  assert.deepEqual(quizTypePlan(["choice", "ox", "short", "blank"], 10), [
    { type: "choice", n: 4 },
    { type: "ox", n: 1 },
    { type: "short", n: 3 },
    { type: "blank", n: 2 },
  ]);
  assert.deepEqual(quizTypePlan(["blank", "choice"], 1), [{ type: "choice", n: 1 }]);
  assert.deepEqual(quizTypePlan([], 5), []);
});

test("주관식·빈칸 문항 검증", () => {
  const short = validateQuizQuestion({ type: "short", question: "세계인권선언 채택 연도는?", answer_text: "1948년", accepted_answers: ["1948"], explanation: "" });
  assert.deepEqual(short?.accepted, ["1948년", "1948"]);
  assert.equal(short?.answerIndex, -1);
  assert.equal(validateQuizQuestion({ type: "blank", question: "빈칸 표시가 없는 문장", answer_text: "답", explanation: "" }), null);
  assert.ok(validateQuizQuestion({ type: "blank", question: "____ 은 1948년에 채택되었다.", answer_text: "세계인권선언", explanation: "" }));
  assert.equal(validateQuizQuestion({ type: "short", question: "질문", answer_text: "", explanation: "" }), null);
});

test("주관식 채점: 띄어쓰기·대소문자·문장부호 차이는 무시", () => {
  const q = { answer: "세계 인권 선언", accepted: ["UDHR"] };
  assert.equal(isTextAnswerCorrect("세계인권선언", q), true);
  assert.equal(isTextAnswerCorrect(" udhr. ", q), true);
  assert.equal(isTextAnswerCorrect("인권선언", q), false);
  assert.equal(isTextAnswerCorrect("   ", q), false);
});

test("퀴즈는 다섯 유형을 다 쓰고 객관식이 가장 많다 (2026-11-13)", () => {
  assert.deepEqual(sanitizeQuizPrefs(null).types, ["choice", "ox", "short", "blank", "match"]);
  // 10문제면 객관식 3 · 빈칸 2 · 단답 2 · 짝 맞추기 2 · OX 1 (OX는 찍어도 절반이 맞아 가장 적게)
  assert.deepEqual(quizTypePlan(["choice", "ox", "short", "blank", "match"], 10), [
    { type: "choice", n: 3 },
    { type: "ox", n: 1 },
    { type: "short", n: 2 },
    { type: "blank", n: 2 },
    { type: "match", n: 2 },
  ]);
  // 직접 고른 설정은 그대로 둔다
  assert.deepEqual(sanitizeQuizPrefs({ types: ["blank"] }).types, ["blank"]);
  // 객관식을 끄면 남은 유형끼리 고르게 나눈다
  assert.deepEqual(quizTypePlan(["short", "blank"], 10), [{ type: "short", n: 5 }, { type: "blank", n: 5 }]);
});

test("짝 맞추기: 3~5쌍이어야 하고 같은 말이 두 번 나오면 안 된다", () => {
  const ok = validateQuizQuestion({
    type: "match",
    question: "다음 용어와 뜻을 알맞게 이으세요",
    explanation: "자료에 나온 정의",
    pairs: [
      { left: "생태계 평형", right: "큰 변화가 오래 지속되지 않는 상태" },
      { left: "생태피라미드", right: "먹이 관계에 따른 생물의 위치" },
      { left: "이석", right: "물고기 머리 안의 단단한 돌" },
    ],
  });
  assert.equal(ok?.type, "match");
  assert.equal(ok?.pairs?.length, 3);
  assert.deepEqual(ok?.choices, []);
  // 2쌍이면 찍어서 맞는다
  assert.equal(validateQuizQuestion({ type: "match", question: "q", pairs: [{ left: "a", right: "b" }, { left: "c", right: "d" }] }), null);
  // 같은 말이 두 번이면 정답이 하나로 정해지지 않는다
  assert.equal(
    validateQuizQuestion({ type: "match", question: "q", pairs: [{ left: "a", right: "b" }, { left: "a", right: "c" }, { left: "d", right: "e" }] }),
    null
  );
});
