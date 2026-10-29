import { test } from "node:test";
import assert from "node:assert/strict";
import { renderScopedGuide, renderScopedRequirements, scopeStatements, scopedLinesFor, splitStatements, type ScopeElement } from "./requirement-scope.ts";

// 실제 안내문(공통국어2 매체 활용 주제발표 사진)을 분석시킨 결과(2026-10-27~28, 4회)에서 옮긴 자료.
const OUTLINE: ScopeElement = {
  label: "개요",
  description: "글의 목적·주제·예상 독자를 설정하고 중심 내용과 세부 내용을 구상하며, 근거 정보와 출처를 정리하는 개요를 작성한다.",
  required_items: ["글의 목적", "주제", "예상 독자", "중심 내용", "세부 내용", "근거 정보", "근거자료 출처"],
};
const BOARD: ScopeElement = { label: "스토리보드", description: "개요에서 생성한 내용을 바탕으로 8개의 장면으로 스토리보드를 작성하고 시각 이미지를 탑재한다." };
const SPEECH: ScopeElement = { label: "매체 활용 의견 발표", description: "찬반을 세트로 하여 의견을 발표한다. 그림 자료를 활용하고 대본 없이 자연스럽게 말한다." };

const R3 = [
  "개요와 스토리보드를 모두 작성하며, 두 결과물 모두 점수에 반영됨.",
  "개요에서 글의 목적·주제·예상 독자를 구체적으로 설정하고, 중심 내용과 세부 내용을 구성할 것.",
  "내용을 뒷받침하는 정보(근거)를 3가지 이상 수집하고, 출처를 명확히 밝힌 적절한 근거자료를 사용할 것.",
  "개요에서 생성한 내용을 바탕으로 8개의 장면으로 스토리보드를 작성할 것. 8개가 기본이며 10개까지 가능함.",
  "스토리보드 내용의 통일성과 응집성을 갖추고 적절한 흐름으로 구성할 것.",
  "발표는 대본 없이 자연스럽게 진행할 것.",
  "발표 시간은 2분30초~3분.",
  "찬반은 세트로 발표하며, 찬성 먼저 또는 반대 바로 다음 순서로 발표함.",
  "순서는 제비뽑기로 정하고, 합의하면 찬반 세트 안에서 순서를 바꿀 수 있음.",
  "수업 중 직접 작성: 청중기록지",
];
const R4 = [
  "개요와 스토리보드를 작성하고 매체 자료를 활용해 의견을 발표한다.",
  "스토리보드는 8개의 장면으로 작성한다. 8개가 기본이며 10개까지 가능하고, 부족하면 감점된다.",
  "그림 자료는 사전에 구상하고, 실제 그림 자료는 2차시에 하이러닝 클래스보드에 당일 탑재한다.",
  "발표는 찬반을 세트로 하며, 제비뽑기로 정한 순서에 따라 진행한다.",
  "대본 없이 자연스럽게 발표한다(2분30초~3분).",
  "수업 중 직접 작성: 청중기록지",
];
const G4 =
  "개요에는 글의 목적·주제·예상 독자, 중심 내용과 세부 내용, 근거 정보 3가지 이상, 출처를 포함한다. 스토리보드는 개요의 내용을 바탕으로 8개의 장면으로 구성하고, 내용의 통일성과 응집성 및 흐름을 갖춘다. 그림 자료는 그림·그래프·표만 사용 가능하며, 제목 부분에는 영상형 키워드 1~2개를 기록할 수 있다. 예시 답안은 안내문에 제시되어 있지 않다. 발표는 대본 없이 자연스럽게 진행하며, 내용의 논리성과 완결성, 그림 자료의 적절성, 발표 태도·흐름·청중과의 소통을 평가한다.";

const ALL = [OUTLINE, BOARD];
const GEN = ["개요", "스토리보드"];
const PERF_WORDS = /대본|발표 시간|2분30초|찬반은 세트|제비뽑기|청중기록지|발표는/;

// 수정 전: 모든 요구사항 줄이 모든 단계 프롬프트에 그대로 들어갔다(generate-essay.ts의 "[요구사항]" 블록).
const oldRender = (lines: string[]) => lines.map((r) => `- ${r}`).join("\n");

test("재현: 수정 전에는 발표 시간·대본 금지·청중기록지가 개요 프롬프트에 그대로 들어갔다", () => {
  assert.match(oldRender(R3), /발표 시간은 2분30초/);
  assert.match(oldRender(R3), /대본 없이/);
  assert.match(oldRender(R3), /청중기록지/);
});

test("발표 방식·시간·대본 금지·순서·청중기록지는 개요·스토리보드 프롬프트에서 빠진다", () => {
  for (const reqs of [R3, R4]) {
    const text = renderScopedRequirements(reqs, ALL, GEN);
    assert.doesNotMatch(text, PERF_WORDS, text);
  }
  const s = scopeStatements(splitStatements(R3), ALL, GEN);
  assert.equal(s.withheld.length, 5);
});

test("결과물별 조건은 해당 단계에만 간다: 근거 수·출처는 개요, 장면 수·그림 종류는 스토리보드", () => {
  const s = scopeStatements(splitStatements(R3), ALL, GEN);
  const outline = s.byLabel["개요"].join(" ");
  const board = s.byLabel["스토리보드"].join(" ");
  assert.match(outline, /3가지 이상/);
  assert.match(outline, /출처를 명확히/);
  assert.match(outline, /글의 목적·주제·예상 독자/);
  assert.doesNotMatch(outline, /8개의 장면/); // "개요에서 생성한 내용을 바탕으로 8개의 장면으로 스토리보드"는 스토리보드 조건이다
  assert.match(board, /8개의 장면/);
  assert.match(board, /10개까지/);
  assert.match(board, /통일성과 응집성/);

  const s4 = scopeStatements(splitStatements(R4), ALL, GEN);
  const board4 = s4.byLabel["스토리보드"].join(" ");
  assert.match(board4, /그림 자료는 사전에 구상하고/);
  assert.doesNotMatch(s4.byLabel["개요"]?.join(" ") ?? "", /그림 자료|8개의 장면/);
});

test("여러 단계를 함께 말하는 문장은 두 단계 모두에 간다", () => {
  const s = scopeStatements(splitStatements(R3), ALL, GEN);
  assert.ok(s.byLabel["개요"].includes("개요와 스토리보드를 모두 작성하며, 두 결과물 모두 점수에 반영됨."));
  assert.ok(s.byLabel["스토리보드"].includes("개요와 스토리보드를 모두 작성하며, 두 결과물 모두 점수에 반영됨."));
});

test("작성 기준(writing_guide)도 같은 규칙으로 나눈다: 그림 종류·제목 키워드는 스토리보드, 발표 평가는 뺀다", () => {
  const text = renderScopedGuide(G4, ALL, GEN);
  assert.match(text, /"스토리보드" 단계:.*그림·그래프·표만 사용 가능/);
  assert.match(text, /제목 부분에는 영상형 키워드 1~2개/);
  assert.match(text, /"개요" 단계:.*근거 정보 3가지 이상/);
  assert.doesNotMatch(text, /발표는 대본 없이|청중과의 소통|발표 태도/);
});

test("발표 자체가 만들 단계에 있으면(예: 발표 대본) 발표 조건은 그 단계로 간다", () => {
  const speech: ScopeElement = { label: "발표 대본", description: "발표 대본을 쓴다" };
  const s = scopeStatements(splitStatements(["발표 시간은 3분이다.", "발표는 대본을 읽는다."]), [OUTLINE, speech], ["개요", "발표 대본"]);
  assert.deepEqual(s.byLabel["발표 대본"], ["발표 시간은 3분이다.", "발표는 대본을 읽는다."]);
  assert.deepEqual(s.withheld, []);
});

test("만들지 않는 단계(분석이 뺀 발표 등)가 task_elements에 남아 있어도 그 조건은 만드는 단계에 가지 않는다", () => {
  const s = scopeStatements(splitStatements(R3), [OUTLINE, BOARD, SPEECH], GEN);
  assert.equal(s.withheld.length, 5);
  assert.deepEqual(s.byLabel["매체 활용 의견 발표"] ?? [], []);
});

test("영상 길이처럼 만드는 단계의 조건인 '분'은 발표 조건으로 오인하지 않는다", () => {
  const s = scopeStatements(splitStatements(["스토리보드는 1분 홍보 영상을 8장면으로 구성한다."]), ALL, GEN);
  assert.deepEqual(s.withheld, []);
  assert.equal(s.byLabel["스토리보드"].length, 1);
});

test("단계가 하나뿐이면 단계 머리말 없이 한 목록이고, 나눌 게 없으면 빈 문구", () => {
  const one = scopedLinesFor("스토리보드", R4, ALL, GEN);
  assert.ok(one.some((l) => l.includes("8개의 장면")));
  assert.ok(!one.some((l) => PERF_WORDS.test(l)));
  assert.equal(renderScopedRequirements([], ALL, GEN), "(명시된 요구사항 없음)");
  assert.equal(renderScopedGuide(undefined, ALL, GEN), "");
});

test("렌더링: 공통과 단계별이 구분되어 보인다", () => {
  const text = renderScopedRequirements(R4, ALL, GEN);
  assert.match(text, /단계별 요구사항/);
  assert.match(text, /- "스토리보드" 단계: /);
});

test("단계가 하나뿐인 과제는 나누지 않고 그대로 준다(섞일 일이 없고, 발표 자체가 그 결과물일 수 있다)", () => {
  const only: ScopeElement = { label: "독후 감상문", description: "책을 읽고 쓴다" };
  const reqs = ["발표 시간은 3분이다.", "책 이야기를 쓴다."];
  assert.equal(renderScopedRequirements(reqs, [only], ["독후 감상문"]), ["- 발표 시간은 3분이다.", "- 책 이야기를 쓴다."].join("\n"));
  assert.deepEqual(scopedLinesFor("독후 감상문", reqs, [only], ["독후 감상문"]), reqs);
  assert.equal(renderScopedGuide("발표는 3분이다.", [only], ["독후 감상문"]), "발표는 3분이다.");
});
