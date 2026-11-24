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

import {
  bookQuestionOpen,
  buildBookQuestion,
  buildExcerptQuestion,
  buildMaterialQuestion,
  cleanOptions,
  excerptQuestionOpen,
  parseBookAnswer,
  studentExcerptState,
  unseenMaterialPointer,
} from "./questions-pure.ts";

const task = (topic: string, requirements: string[], elements: { label: string; description: string }[] = []) => ({ topic, requirements, task_elements: elements });
const BOOKRX = task("책 처방전", ["3차시: 친구의 문제 상황에 도움을 줄 수 있는 책을 소개함.", "인상적인 구절 등을 적어 오도록 함"], [{ label: "책 처방전", description: "책 제목, 저자, 인상적인 구절 등을 적어 올 수 있도록 함." }]);

test("선택형 질문에도 직접 답할 칸을 항상 준다(2026-11-22 사용자 보고: 보기만 있고 쓸 칸이 없었다)", () => {
  const q = sanitizeQuestion({ text: "어떤 인물로 쓸까요?", kind: "choice", options: ["a", "b"], allow_other: false, why: "" }, []);
  assert.equal(q?.allowOther, true);
});

test("책 질문: 책 과제이고 아직 책이 안 정해졌을 때만, 학생이 정했거나 이미 물었으면 묻지 않는다", () => {
  assert.equal(bookQuestionOpen({ info: BOOKRX, instructions: "", answers: [] }), true);
  assert.equal(bookQuestionOpen({ info: BOOKRX, instructions: "내가 고른 책은 『사피엔스』야", answers: [] }), false);
  assert.equal(bookQuestionOpen({ info: BOOKRX, instructions: "", answers: [{ question: "어떤 책으로 할까요?", key: "book_title", answer: "", state: "delegate" }] }), false);
  // 책 과제가 아니면 묻지 않는다
  assert.equal(bookQuestionOpen({ info: task("해양 플라스틱 정책 제안", ["정책을 제안한다."]), instructions: "", answers: [] }), false);
  // 도서관·참고 목록 문장은 책 과제가 아니다(book-hint 규칙)
  assert.equal(bookQuestionOpen({ info: task("지역 문제 탐구", ["도서관에서 자료를 조사한다.", "참고한 도서를 기록한다."]), instructions: "", answers: [] }), false);
});

test("구절 질문: 구절을 요구하고 학생이 책을 정했을 때만(책을 AI에게 맡겼으면 묻지 않는다)", () => {
  const picked: PreAnswer[] = [{ question: "어떤 책으로 할까요?", key: "book_title", answer: "미움받을 용기 — 기시미 이치로", state: "answered" }];
  assert.equal(excerptQuestionOpen({ info: BOOKRX, instructions: "", answers: picked }), true);
  assert.equal(excerptQuestionOpen({ info: BOOKRX, instructions: "", answers: [{ ...picked[0], state: "delegate", answer: "" }] }), false);
  assert.equal(excerptQuestionOpen({ info: BOOKRX, instructions: "", answers: [] }), false);
  assert.equal(excerptQuestionOpen({ info: BOOKRX, instructions: "", answers: [...picked, { question: "구절?", key: "book_excerpt", answer: "", state: "later" }] }), false);
  // 구절을 요구하지 않는 책 과제는 구절을 묻지 않는다
  assert.equal(excerptQuestionOpen({ info: task("독서 감상문", ["읽은 책의 줄거리와 감상을 쓴다."]), instructions: "『사피엔스』", answers: [] }), false);
});

test("못 보는 자료 질문: 한 실험·활동을 교과서 쪽수로만 가리킬 때만(시험 범위·실린 자료·학생이 말한 쪽은 제외)", () => {
  const ptr = (info: ReturnType<typeof task> & { provided_materials?: string[] }, instructions = "", answers: PreAnswer[] = []) => unseenMaterialPointer({ info, instructions, answers });
  const lab = task("화학 실험", ["실험 결과를 바탕으로 결론 도출 및 보고서 작성"], [{ label: "실험", description: "반응 속도 측정 실험(실험 교과서 p.217)" }]);
  assert.equal(ptr(lab), "반응 속도 측정 실험(실험 교과서 p.217)");
  assert.equal(ptr(lab, "교과서 217쪽 실험은 과산화수소 분해야"), null); // 학생이 이미 말했다
  assert.equal(ptr({ ...lab, provided_materials: ["실험 절차: …"] }), null);
  assert.equal(ptr(lab, "", [{ question: "실제로 하는 내용이 무엇인가요?", key: "unseen_material", answer: "x", state: "answered" }]), null);
  // 시험 범위는 한 활동의 내용이 아니다(가정-03 "범위: 교과서 p29~p40", 수학-01)
  assert.equal(ptr(task("가정", ["범위: 교과서 p29~p40 / 해당범위 학습지"])), null);
  assert.equal(ptr(task("수학", ["시험범위: 교과서 p10-p25 활동"])), null);
});

test("답변을 지침으로: 책 제목은 겹낫표(저자 포함)로, 구절은 원문 표지로 바뀌어 생성이 읽는다", () => {
  assert.deepEqual(parseBookAnswer("미움받을 용기 — 기시미 이치로"), { title: "미움받을 용기", author: "기시미 이치로" });
  assert.deepEqual(parseBookAnswer("『사피엔스』"), { title: "사피엔스", author: undefined });
  const text = answersToInstructions([
    { question: "어떤 책으로 할까요?", key: "book_title", answer: "미움받을 용기 — 기시미 이치로", state: "answered" },
    { question: "그 책에서 인상 깊은 구절이 있나요?", key: "book_excerpt", answer: "나는 나를 좋아한다", state: "answered" },
  ]);
  assert.match(text, /기시미 이치로의 『미움받을 용기』/);
  assert.equal(studentExcerptState(text), "provided");
  assert.match(text, /"나는 나를 좋아한다"/);
  const later = answersToInstructions([{ question: "그 책에서 인상 깊은 구절이 있나요?", key: "book_excerpt", answer: "", state: "later" }]);
  assert.equal(studentExcerptState(later), "later");
  assert.equal(studentExcerptState(answersToInstructions([{ question: "그 책에서 인상 깊은 구절이 있나요?", key: "book_excerpt", answer: "", state: "delegate" }])), null);
  assert.equal(studentExcerptState(undefined), null);
});

test("질문 만들기: 직접 입력은 항상 열려 있고 보기는 정리된다", () => {
  assert.equal(buildBookQuestion([]).allowOther, true);
  assert.equal(buildExcerptQuestion([]).allowLater, true);
  const m = buildMaterialQuestion("반응 속도 측정 실험(실험 교과서 p.217)", [], ["a", "b"]);
  assert.ok(m.text.length <= 140 && m.allowLater && m.key === "unseen_material");
  assert.deepEqual(cleanOptions(["미움받을 용기 — 기시미 이치로", "미움받을 용기 — 기시미 이치로", "직접 입력", "AI가 정해 주세요", "", "사피엔스 — 유발 하라리"]), ["미움받을 용기 — 기시미 이치로", "사피엔스 — 유발 하라리"]);
});

test("못 보는 자료를 AI에게 맡겨도 하나의 실험을 단정하지 않는다", () => {
  const t = answersToInstructions([{ question: "실제로 하는 내용이 무엇인가요?", key: "unseen_material", answer: "", state: "delegate" }]);
  assert.match(t, /실제 내용을 우리는 모른다[\s\S]*단정하지 말고[\s\S]*\[직접 작성: 무엇\]/);
});

import { isDrawnInClass } from "./questions-pure.ts";

test("수업 중에 뽑는 자료도 묻는다(2026-11-24 국어 책처방전): 고민을 이미 적었거나 뽑는 대상이 글감이 아니면 묻지 않는다", () => {
  const ptr = (info: ReturnType<typeof task>, instructions = "") => unseenMaterialPointer({ info, instructions, answers: [] });
  const drawn = task("책 처방전", ["2차시: 무기명으로 요약된 고민 중 하나를 무작위로 뽑아 분석하고 해결책을 제안함."]);
  const p = ptr(drawn);
  assert.ok(p && /무작위로 뽑아/.test(p));
  assert.ok(isDrawnInClass(p!));
  assert.equal(ptr(drawn, "2차시에서 뽑은 친구의 고민은 소심해서 친구 사귀기 어렵다는 거야"), null); // 학생이 이미 고민을 적었다
  // 글감이 아닌 것을 뽑는 안내(발표 순서·자리 추첨)는 묻지 않는다
  assert.equal(ptr(task("발표", ["발표 순서는 추첨으로 정한다."])), null);
  assert.equal(ptr(task("모둠", ["모둠원은 무작위로 뽑는다."])), null);
  // 문구는 교과서 자료와 다르게 나온다
  const q = buildMaterialQuestion(p!, [], ["a"]);
  assert.match(q.text, /수업 시간에 뽑게 되는 내용/);
  assert.ok(q.allowLater && q.allowOther && q.key === "unseen_material");
  assert.equal(buildMaterialQuestion("반응 속도 측정 실험(실험 교과서 p.217)", [], []).text.includes("이라고만 적혀 있어요"), true);
});

import { ownStoryPointer, buildOwnStoryQuestion } from "./questions-pure.ts";

test("본인의 고민·사연을 직접 쓰는 칸은 지어내지 않고 묻는다(진로·생각은 주제 질문이 맡으므로 제외)", () => {
  const own = (info: ReturnType<typeof task>, instructions = "", answers: PreAnswer[] = []) => ownStoryPointer({ info, instructions, answers });
  const rx = task("책 처방전", [], [{ label: "고민 쓰기", description: "요즘 나의 고민, 해결하고 싶은 문제를 구체적으로 씀." }]);
  const p = own(rx);
  assert.equal(p, "고민 쓰기"); // 질문에는 칸 이름만 인용한다(긴 설명은 문장 중간에서 잘린다)
  assert.equal(own(rx, "요즘 시험 때문에 잠을 못 자는 게 고민이야"), null); // 학생이 이미 적었다
  assert.equal(own(rx, "", [{ question: "내 이야기가 있나요?", key: "own_story", answer: "", state: "later" }]), null); // 이미 물었다
  assert.equal(own(task("진로", [], [{ label: "진로 서술", description: "자신의 진로와 선택한 이유를 서술한다." }])), null);
  assert.equal(own(task("토론", [], [{ label: "고민 해결", description: "친구의 고민을 듣고 해결책을 쓴다." }])), null); // 남의 고민
  const q = buildOwnStoryQuestion(p!, []);
  assert.ok(q.kind === "personal" && q.allowLater && q.allowOther && q.key === "own_story" && q.text.length <= 140 && q.options.length === 0);
});
