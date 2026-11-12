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
  assert.deepEqual(quizTypePlan(["choice", "ox", "short", "blank"], 10), [
    { type: "choice", n: 3 },
    { type: "ox", n: 3 },
    { type: "short", n: 2 },
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

test("퀴즈 기본은 빈칸·단답이고, 옛 기본값이 저장돼 있으면 옮긴다", () => {
  // 새 사용자
  assert.deepEqual(sanitizeQuizPrefs(null).types, ["short", "blank"]);
  // 설정을 열어 본 적 있어 네 유형이 다 저장된 사람 — 고른 적 없는 것으로 보고 옮긴다
  assert.deepEqual(sanitizeQuizPrefs({ types: ["choice", "ox", "short", "blank"] }).types, ["short", "blank"]);
  // 직접 고른 사람은 그대로 둔다
  assert.deepEqual(sanitizeQuizPrefs({ types: ["choice"] }).types, ["choice"]);
  assert.deepEqual(sanitizeQuizPrefs({ types: ["ox", "short"] }).types, ["ox", "short"]);
  // 난이도·개수 같은 다른 설정은 건드리지 않는다
  const kept = sanitizeQuizPrefs({ types: ["choice", "ox", "short", "blank"], difficulty: "hard", count: 15 });
  assert.equal(kept.difficulty, "hard");
  assert.equal(kept.count, 15);
});
