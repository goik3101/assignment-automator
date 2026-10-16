import { test } from "node:test";
import assert from "node:assert/strict";
import { QUESTION_CAP, answersToInstructions, mergeInstructions, parseMode, sanitizeAnswers, sanitizeQuestion, type PreAnswer } from "./questions-pure.ts";

test("모드: 기본은 빠르게 만들기(2개), 나에게 맞추기는 4개", () => {
  assert.equal(parseMode(undefined), "fast");
  assert.equal(parseMode("personal"), "personal");
  assert.equal(parseMode("아무거나"), "fast");
  assert.equal(QUESTION_CAP.fast, 2);
  assert.equal(QUESTION_CAP.personal, 4);
});

test("질문 다듬기: 보기 2개 미만 선택형·너무 짧거나 긴 질문은 버린다", () => {
  assert.equal(sanitizeQuestion({ text: "어떤 인물로 쓸까요?", kind: "choice", options: ["한 가지"], allow_other: false, why: "" }, []), null);
  assert.equal(sanitizeQuestion({ text: "네?", kind: "choice", options: ["a", "b"] }, []), null);
  assert.equal(sanitizeQuestion({ text: "가".repeat(200), kind: "choice", options: ["a", "b"] }, []), null);
  assert.equal(sanitizeQuestion(null, []), null);
  const q = sanitizeQuestion({ text: " 어떤 분야의 인물로 쓸까요? ", kind: "choice", options: ["과학", "과학", " 정치 ", "예술", "체육", "경제", "의학"], allow_other: true, why: "분야에 따라 내용이 달라져요" }, []);
  assert.equal(q?.text, "어떤 분야의 인물로 쓸까요?");
  assert.deepEqual(q?.options, ["과학", "정치", "예술", "체육", "경제"]); // 중복 제거 + 최대 5개
  assert.equal(q?.allowOther, true);
  assert.equal(q?.id, "q1");
});

test("개인형 질문은 보기 없이도 가능하고 직접 쓰기를 항상 허용한다", () => {
  const q = sanitizeQuestion({ text: "소감문에 넣고 싶은 실제 경험이 있나요?", kind: "personal", options: [], allow_other: false, why: "" }, []);
  assert.equal(q?.kind, "personal");
  assert.equal(q?.allowOther, true);
});

test("이미 한 질문과 같거나 거의 같으면 더 묻지 않는다", () => {
  const asked: PreAnswer[] = [{ question: "어떤 분야의 인물로 쓸까요?", answer: "과학", state: "answered" }];
  assert.equal(sanitizeQuestion({ text: "어떤 분야의 인물로 쓸까요", kind: "choice", options: ["a", "b"] }, asked), null);
  assert.equal(sanitizeQuestion({ text: "어떤 시대의 인물로 쓸까요?", kind: "choice", options: ["a", "b"] }, asked)?.id, "q2");
});

test("답변을 지침으로: 나중에 쓰기는 지어내지 말라고, 맡김은 개인 경험 금지로 못박는다", () => {
  const text = answersToInstructions([
    { question: "어떤 분야?", answer: "과학", state: "answered" },
    { question: "실제 경험이 있나요?", answer: "", state: "later" },
    { question: "어떤 관점?", answer: "", state: "delegate" },
  ]);
  assert.match(text, /답: 과학/);
  assert.match(text, /직접 쓰겠다고 함[\s\S]*지어내지 말고[\s\S]*\[직접 작성: 무엇\]/);
  assert.match(text, /AI에게 맡김[\s\S]*경험·감정은 지어내지 말 것/);
  assert.equal(answersToInstructions([]), "");
});

test("지침 합치기: 기존 지침 뒤에 붙이고 길이 상한을 지킨다", () => {
  const merged = mergeInstructions("5분 발표", [{ question: "Q", answer: "A", state: "answered" }]);
  assert.match(merged, /^5분 발표\n\n\[학생이 제작 전에/);
  assert.equal(mergeInstructions("가".repeat(6000), []).length, 4800);
  assert.equal(mergeInstructions("", []), "");
});

test("입력 답변 정리: 개수 제한·빈 답 제거·상태 검증", () => {
  const out = sanitizeAnswers(
    [
      { question: "Q1", answer: "  답  ", state: "answered" },
      { question: "Q2", answer: "", state: "answered" }, // 빈 답은 제거
      { question: "Q3", answer: "", state: "later" },
      { question: "Q4", answer: "x", state: "weird" },
      { question: "Q5", answer: "y" },
    ],
    3
  );
  assert.deepEqual(out.map((a) => [a.question, a.state]), [["Q1", "answered"], ["Q3", "later"]]);
  assert.deepEqual(sanitizeAnswers("x", 2), []);
});

test("화면이 따로 주는 보기(직접 입력·AI에게 맡김)는 모델이 넣어도 뺀다", () => {
  const q = sanitizeQuestion({ text: "어떤 분야의 인물로 쓸까요?", kind: "choice", options: ["과학", "직접 입력하겠습니다", "AI에게 맡길게요", "예술", "상관없어요"], allow_other: true, why: "", decision_key: "person_field" }, []);
  assert.deepEqual(q?.options, ["과학", "예술"]);
  assert.equal(q?.key, "person_field");
});

test("같은 결정(decision key)은 문장이 달라도 다시 묻지 않는다", () => {
  const asked: PreAnswer[] = [{ question: "어떤 책으로 쓸까요?", answer: "어린 왕자", state: "answered", key: "book_title" }];
  assert.equal(sanitizeQuestion({ text: "감상문에 쓸 도서를 골라 주세요", kind: "choice", options: ["a", "b"], decision_key: "Book_Title" }, asked), null);
  assert.equal(sanitizeQuestion({ text: "나의 생각은 어떻게 할까요?", kind: "choice", options: ["a", "b"], decision_key: "opinion" }, asked)?.key, "opinion");
});

test("개인 내용을 AI가 어떻게 처리할지 묻는 질문은 만들지 않는다(서비스 규칙으로 이미 정해짐)", () => {
  assert.equal(sanitizeQuestion({ text: "나의 생각을 직접 쓰시겠습니까, 아니면 AI가 일반 학생 관점으로 대신 작성할까요?", kind: "choice", options: ["직접 작성", "AI가 작성"] }, []), null);
  assert.equal(sanitizeQuestion({ text: "개인적 부분은 어떻게 할까요?", kind: "choice", options: ["빈칸으로 남겨 주세요", "일반 문장으로"] }, []), null);
  assert.equal(sanitizeQuestion({ text: "어떤 책으로 쓸까요?", kind: "choice", options: ["어린 왕자", "소년이 온다"] }, [])?.kind, "choice");
});
