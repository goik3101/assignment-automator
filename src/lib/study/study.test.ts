import { test } from "node:test";
import assert from "node:assert/strict";
import { parseContextRef, clip, learningToText, assignmentInfoToText } from "./context-pure.ts";
import { buildChatPrompt, offersMemorize, routedAnswer } from "./chat-pure.ts";
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

test("안내문 정보: 주제·요구사항·해야 할 일·작성 기준을 담고 행정정보는 넣지 않는다", () => {
  const t = assignmentInfoToText(
    {
      topic: "인권 선구자 탐구",
      requirements: ["인물 1명 선정", "출처 표기"],
      task_elements: [
        { label: "탐구 보고서", description: "인물을 조사해 쓴다", target_length: { min: 750, max: 850, counts_spaces: true }, required_items: ["인물 배경", "주요 활동"] },
        { label: "영어 요약", description: "", target_length: { min: 100, max: 120, counts_spaces: true, unit: "words" } },
      ],
      writing_guide: "항목마다 소제목을 단다",
      due_date: "2026-11-30",
    },
    "내 진로는 법조인"
  );
  assert.match(t, /주제: 인권 선구자 탐구/);
  assert.match(t, /- 인물 1명 선정/);
  assert.match(t, /- 탐구 보고서 \(분량 750~850자\): 인물을 조사해 쓴다\n {2}필수 항목: 인물 배경, 주요 활동/);
  assert.match(t, /- 영어 요약 \(분량 100~120단어\)$/m);
  assert.match(t, /작성 기준.*\n항목마다 소제목을 단다/);
  assert.match(t, /학생이 이번 과제에 덧붙인 요청: 내 진로는 법조인/);
  assert.doesNotMatch(t, /2026-11-30/);
});

test("안내문 정보: 비었거나 모양이 달라도 던지지 않는다", () => {
  for (const bad of [null, undefined, "x", 5, [], {}, { task_elements: "x", requirements: 3 }, { task_elements: [null, 1, { label: "" }] }]) {
    assert.equal(assignmentInfoToText(bad), "");
  }
  assert.equal(assignmentInfoToText(null, "  "), "");
  assert.equal(assignmentInfoToText({ topic: "가".repeat(5000) }).length <= 3000 + 10, true);
});

test("채팅 프롬프트: 안내문·자료·대화·문체 규칙 순서, 안내문이 없으면 그 블록을 뺀다", () => {
  const turns = [{ role: "user" as const, content: "이 수행평가 핵심 개념 설명해줘" }];
  const withInfo = buildChatPrompt({
    context: { title: "인권", subject: "사회", sourceLabel: "AI가 작성한 결과물", text: "본문", assignmentInfo: "주제: 인권" },
    turns,
    toneRules: "[문체]",
  });
  assert.ok(withInfo.indexOf("[과제 안내") < withInfo.indexOf("[과제 자료") && withInfo.indexOf("[과제 자료") < withInfo.indexOf("[대화]") && withInfo.indexOf("[대화]") < withInfo.indexOf("[문체]"));
  assert.match(withInfo, /학생: 이 수행평가 핵심 개념 설명해줘/);
  const noInfo = buildChatPrompt({ context: { title: "t", subject: "s", sourceLabel: "x", text: "본문" }, turns, toneRules: "R" });
  assert.doesNotMatch(noInfo, /\[과제 안내/);
  const none = buildChatPrompt({ turns, toneRules: "R" });
  assert.doesNotMatch(none, /\[과제 (안내|자료)/);
});

test("채팅 1차 답변: 검색이 필요 없다고 하고 답이 있을 때만 그대로 쓴다", () => {
  assert.equal(routedAnswer({ needs_search: false, answer: "  답이에요 " }), "답이에요");
  assert.equal(routedAnswer({ needs_search: true, answer: "일단 답" }), null);
  assert.equal(routedAnswer({ needs_search: false, answer: "  " }), null);
  assert.equal(routedAnswer({ needs_search: false }), null);
  assert.equal(routedAnswer({ needs_search: false, answer: 5 }), null);
  assert.equal(routedAnswer(null), null);
});

test("암기 방법 고르기: 저장된 과제가 있고 모델이 true라고 했을 때만 켠다", () => {
  assert.equal(offersMemorize({ offer_memorize: true }, true), true);
  assert.equal(offersMemorize({ offer_memorize: true }, false), false);
  assert.equal(offersMemorize({ offer_memorize: false }, true), false);
  assert.equal(offersMemorize({ offer_memorize: "true" }, true), false);
  assert.equal(offersMemorize(null, true), false);
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
