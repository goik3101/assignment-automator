import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTutorPrompt, decideTutorRoute, questionFromStored, questionsLeft, sanitizeTutorQuestion, titleFromMessage, TUTOR_QUESTION_CAP } from "./tutor-pure.ts";
import { isUuid, parseContextRef, tutorToText } from "../study/context-pure.ts";

const UUID = "0e2e2ca1-701d-485b-b8b1-0cc3ce8cf30e";

test("튜터 질문 정리: 보기 중복·빈 값을 거르고 5개까지, 보기가 1개뿐이면 직접 입력 질문이 된다", () => {
  const q = sanitizeTutorQuestion({ text: " 어떤 입장으로 쓸까요? ", options: ["찬성", "반대", "찬성", " ", "중립", "조건부", "기타", "여섯째"], allow_other: true });
  assert.deepEqual(q, { text: "어떤 입장으로 쓸까요?", options: ["찬성", "반대", "중립", "조건부", "기타"], allowOther: true });
  assert.deepEqual(sanitizeTutorQuestion({ text: "책 제목이 뭐예요?", options: [], allow_other: true })?.options, []);
  assert.deepEqual(sanitizeTutorQuestion({ text: "Q", options: ["하나뿐"], allow_other: false }), { text: "Q", options: [], allowOther: false });
  for (const bad of [null, undefined, "x", {}, { text: "  " }, { text: 5 }]) assert.equal(sanitizeTutorQuestion(bad), null);
});

test("저장된 질문을 다시 읽어도 같은 모양이다", () => {
  const q = sanitizeTutorQuestion({ text: "Q?", options: ["a", "b"], allow_other: false })!;
  assert.deepEqual(questionFromStored(JSON.parse(JSON.stringify(q))), q);
  assert.equal(questionFromStored(null), null);
});

test("남은 질문 횟수: 최근 대화에서 AI가 이미 되물은 만큼 줄고 0 밑으로 내려가지 않는다", () => {
  assert.equal(questionsLeft([]), TUTOR_QUESTION_CAP);
  assert.equal(questionsLeft([{ role: "assistant", question: { text: "Q" } }, { role: "user" }, { role: "assistant", question: null }]), TUTOR_QUESTION_CAP - 1);
  const many = Array.from({ length: 6 }, () => ({ role: "assistant", question: { text: "Q" } }));
  assert.equal(questionsLeft(many), 0);
  // 학생 메시지의 question 값은 세지 않는다
  assert.equal(questionsLeft([{ role: "user", question: { text: "Q" } }]), TUTOR_QUESTION_CAP);
});

test("대화 제목: 첫 줄만, 길면 자르고, 비면 기본 제목", () => {
  assert.equal(titleFromMessage("  수행평가 개요 짜줘\n두 번째 줄"), "수행평가 개요 짜줘");
  assert.equal(titleFromMessage("가".repeat(60)), "가".repeat(36) + "…");
  assert.equal(titleFromMessage("   \n  "), "새 대화");
});

test("튜터 프롬프트: 이전 대화와 사진 속 글을 담고, 남은 질문 횟수에 따라 안내가 달라진다", () => {
  const turns = [
    { role: "user" as const, content: "이 수행평가 도와줘", attachmentText: "논설문 쓰기 800자" },
    { role: "assistant" as const, content: "어떤 입장으로 쓸까요?" },
    { role: "user" as const, content: "찬성" },
  ];
  const withAsk = buildTutorPrompt({ turns, toneRules: "[문체]", questionsLeft: 2 });
  assert.match(withAsk, /학생: 이 수행평가 도와줘\n\[학생이 올린 사진의 글\]\n논설문 쓰기 800자/);
  assert.match(withAsk, /AI: 어떤 입장으로 쓸까요\?/);
  assert.match(withAsk, /앞으로 2번까지/);
  assert.match(withAsk, /\[문체\]$/);
  const noAsk = buildTutorPrompt({ turns, toneRules: "R", questionsLeft: 0 });
  assert.match(noAsk, /더 묻지 말고/);
  assert.doesNotMatch(noAsk, /앞으로/);
  // AI 답변 쪽 attachmentText는 무시한다
  assert.doesNotMatch(buildTutorPrompt({ turns: [{ role: "assistant", content: "A", attachmentText: "숨김" }, { role: "user", content: "U" }], toneRules: "R", questionsLeft: 1 }), /숨김/);
});

test("학습 도구 자료: 튜터 대화는 uuid ref로 받고, AI가 쓴 글이 없으면 비어 있다고 본다", () => {
  assert.equal(isUuid(UUID), true);
  assert.equal(isUuid("x"), false);
  assert.deepEqual(parseContextRef({ kind: "tutor", id: UUID }), { kind: "tutor", id: UUID });
  assert.equal(tutorToText([{ role: "user", content: "안녕" }]), "");
  assert.equal(tutorToText([]), "");
  const t = tutorToText([
    { role: "user", content: "개요 써줘", attachment_text: "안내문 글" },
    { role: "assistant", content: "1. 서론" },
  ]);
  assert.equal(t, "학생: 개요 써줘\n(학생이 올린 사진의 글)\n안내문 글\n\nAI 튜터: 1. 서론");
});

test("학습 도구 자료: 길면 오래된 대화부터 버리고 최근 글을 남긴다", () => {
  const msgs = [
    { role: "user", content: "오래된 질문" },
    { role: "assistant", content: "오래된 답".repeat(50) },
    { role: "user", content: "최근 질문" },
    { role: "assistant", content: "최근 답" },
  ];
  const t = tutorToText(msgs, 60);
  assert.match(t, /최근 질문/);
  assert.match(t, /최근 답/);
  assert.doesNotMatch(t, /오래된 질문/);
});

test("튜터 길 정하기: 일반 답은 그대로, 글쓰기는 글쓰기 모델로, 검색은 검색으로, 되묻기는 그 자리에서", () => {
  const ask = { text: "어떤 입장으로 쓸까요?", options: ["찬성", "반대"], allow_other: true };
  assert.deepEqual(decideTutorRoute({ needs_search: false, needs_writing: false, answer: " 설명이에요 " }, true), { mode: "direct", answer: "설명이에요", question: null });
  assert.deepEqual(decideTutorRoute({ needs_search: false, needs_writing: true, answer: "" }, true), { mode: "model", writing: true, search: false });
  assert.deepEqual(decideTutorRoute({ needs_search: true, needs_writing: false, answer: "" }, true), { mode: "model", writing: false, search: true });
  assert.deepEqual(decideTutorRoute({ needs_search: true, needs_writing: true, answer: "" }, true), { mode: "model", writing: true, search: true });
  // 글쓰기라고 했어도 답이 이미 있으면 글쓰기 모델로 보낸다(글쓰기 판단이 우선)
  assert.equal(decideTutorRoute({ needs_writing: true, answer: "초안이에요" }, true).mode, "model");
  // 되물을 게 있으면 글쓰기 판단과 상관없이 그 자리에서 되묻는다
  const q = decideTutorRoute({ needs_writing: true, answer: "하나만 확인할게요.", question: ask }, true);
  assert.equal(q.mode, "direct");
  assert.equal(q.mode === "direct" && q.question?.options.length, 2);
  // 질문 횟수를 다 썼으면(canAsk=false) 질문은 버리고 글쓰기로 간다
  assert.deepEqual(decideTutorRoute({ needs_writing: true, answer: "하나만 확인할게요.", question: ask }, false), { mode: "model", writing: true, search: false });
  // TUTOR_WRITE_ROUTING=off면 글쓰기 판단을 무시하고 1차 답을 쓴다
  assert.deepEqual(decideTutorRoute({ needs_writing: true, answer: "초안" }, true, false), { mode: "direct", answer: "초안", question: null });
  // 답도 판단도 없으면 main 모델 폴백
  assert.deepEqual(decideTutorRoute({}, true), { mode: "model", writing: false, search: false });
  assert.deepEqual(decideTutorRoute(null, true), { mode: "model", writing: false, search: false });
});
