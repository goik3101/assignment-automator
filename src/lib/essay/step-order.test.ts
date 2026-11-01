import { test } from "node:test";
import assert from "node:assert/strict";
import { extraCitationRepairText, extraCitations, sectionOrderEdges, stepDependencies, stepWaves, type OrderElement } from "./step-order.ts";
import { previousStepsBlock } from "./parallel-write.ts";

// 실제 안내문(공통국어2 매체 활용 주제발표)의 문장 — requirement-scope.test.ts와 같은 출처.
const OUTLINE: OrderElement = {
  label: "개요",
  description: "글의 목적·주제·예상 독자를 설정하고 중심 내용과 세부 내용을 구상하며, 근거 정보와 출처를 정리하는 개요를 작성한다.",
};
const BOARD: OrderElement = {
  label: "스토리보드",
  description: "개요에서 생성한 내용을 바탕으로 8개의 장면으로 스토리보드를 작성하고 시각 이미지를 탑재한다.",
};

test("'개요에서 생성한 내용을 바탕으로 스토리보드' — 개요를 먼저 쓰는 순서가 된다", () => {
  assert.deepEqual(stepDependencies([OUTLINE, BOARD]), [["개요", "스토리보드"]]);
  assert.deepEqual(stepWaves([OUTLINE, BOARD]), [["개요"], ["스토리보드"]]);
});

test("어순이 바뀌어도 '바탕으로' 왼쪽의 단계가 앞 단계다", () => {
  const board = { label: "스토리보드", description: "스토리보드는 개요의 내용을 바탕으로 작성한다." };
  assert.deepEqual(stepDependencies([OUTLINE, board]), [["개요", "스토리보드"]]);
});

test("두 단계를 함께 말하기만 한 문장은 순서가 아니다", () => {
  const plain = [
    { label: "개요", description: "개요를 작성한다." },
    { label: "스토리보드", description: "스토리보드를 작성한다." },
  ];
  const reqs = ["개요와 스토리보드를 모두 작성하며, 두 결과물 모두 점수에 반영됨.", "스토리보드 내용의 통일성과 응집성을 갖출 것."];
  assert.deepEqual(stepDependencies(plain, reqs), []);
  assert.deepEqual(stepWaves(plain, reqs), [["개요", "스토리보드"]]);
});

test("요구사항 문장에서도 순서를 읽는다", () => {
  const plain = [
    { label: "개요", description: "개요를 작성한다." },
    { label: "스토리보드", description: "스토리보드를 작성한다." },
  ];
  const reqs = ["개요에서 생성한 내용을 바탕으로 8개의 장면으로 스토리보드를 작성할 것."];
  assert.deepEqual(stepWaves(plain, reqs), [["개요"], ["스토리보드"]]);
});

test("사슬이 길어도 묶음은 2개까지만 만든다(전부 직렬이 되면 생성 시간이 그만큼 늘어난다)", () => {
  const els = [
    { label: "자료 수집", description: "자료를 수집한다." },
    { label: "보고서", description: "자료 수집에서 정리한 내용을 바탕으로 보고서를 쓴다." },
    { label: "발표 대본", description: "보고서를 바탕으로 발표 대본을 쓴다." },
  ];
  assert.deepEqual(stepWaves(els), [["자료 수집"], ["보고서", "발표 대본"]]);
  assert.deepEqual(stepWaves(els, [], undefined, 3), [["자료 수집"], ["보고서"], ["발표 대본"]]);
});

test("서로를 가리키는 순환은 순서를 만들지 않는다", () => {
  const els = [
    { label: "가", description: "나를 바탕으로 가를 쓴다." },
    { label: "나", description: "가를 바탕으로 나를 쓴다." },
  ];
  const waves = stepWaves(els);
  assert.equal(waves.flat().length, 2);
});

test("단계가 하나면 묶음도 하나다", () => {
  assert.deepEqual(stepWaves([OUTLINE]), [["개요"]]);
});

test("앞 단계 전달 블록은 본문과 사실 번호를 그대로 넘긴다", () => {
  const block = previousStepsBlock([{ label: "개요", content: "헌법재판소는 2012년에 위헌 결정을 내렸다[F2]." }]);
  assert.match(block, /## 개요/);
  assert.match(block, /\[F2\]/);
  assert.match(block, /번호를 새로 만들지 말 것/);
  assert.equal(previousStepsBlock([]), "");
  assert.equal(previousStepsBlock([{ label: "개요", content: "   " }]), "");
});

test("뒤 단계가 앞 단계에 없는 출처를 쓰면 찾아낸다", () => {
  // 실측(2026-11-01): 개요는 [1][2][3]만 쓰고 스토리보드가 [4]를 새로 꺼냈다.
  assert.deepEqual(extraCitations("… [1] … [2] … [4] …", ["… [1] … [2] … [3] …"]), [4]);
  assert.deepEqual(extraCitations("… [2] … [3] …", ["… [1] … [2] … [3] …"]), []);
  // 앞 단계가 여럿이면 그 전부를 합쳐 본다.
  assert.deepEqual(extraCitations("[1][5]", ["[1][2]", "[5]"]), []);
  assert.deepEqual(extraCitations("각주 없는 글", ["[1]"]), []);
});

test("보완 지시는 앞 단계 이름과 문제의 번호를 말한다", () => {
  const t = extraCitationRepairText(["개요"], [4, 5]);
  assert.ok(t.includes("개요"));
  assert.ok(t.includes("[4][5]"));
  assert.ok(t.includes("새 사실"));
});

test("신문 영역은 배경 담당을 먼저 쓰고 나머지는 동시에 쓴다", () => {
  // 직렬 글쓰기가 한 번만 늘게 한다 — 나머지끼리는 역할이 달라 서로 볼 필요가 없다.
  const labels = ["머리기사", "인터뷰", "사설/칼럼", "만평/광고"];
  const edges = sectionOrderEdges(labels, "머리기사");
  assert.deepEqual(edges, [["머리기사", "인터뷰"], ["머리기사", "사설/칼럼"], ["머리기사", "만평/광고"]]);
  const els = labels.map((label) => ({ label, description: `${label}를 쓴다` }));
  assert.deepEqual(stepWaves(els, [], undefined, 2, edges), [["머리기사"], ["인터뷰", "사설/칼럼", "만평/광고"]]);
});

test("배경 담당이 없거나 단계가 하나면 순서를 만들지 않는다", () => {
  assert.deepEqual(sectionOrderEdges(["머리기사"], "머리기사"), []);
  assert.deepEqual(sectionOrderEdges(["머리기사", "인터뷰"], null), []);
  assert.deepEqual(sectionOrderEdges(["머리기사", "인터뷰"], "없는단계"), []);
});

test("추가 순서는 다른 과제의 웨이브를 바꾸지 않는다", () => {
  const els = [
    { label: "개요", description: "개요를 쓴다" },
    { label: "스토리보드", description: "개요에서 생성한 내용을 바탕으로 쓴다" },
  ];
  assert.deepEqual(stepWaves(els, [], undefined, 2, []), stepWaves(els));
  const flat = [
    { label: "산염기 실험", description: "실험 결과를 쓴다" },
    { label: "탐구 보고서", description: "보고서를 쓴다" },
  ];
  assert.deepEqual(stepWaves(flat, [], undefined, 2, []), [["산염기 실험", "탐구 보고서"]]);
});

test("나눠 맡는 영역에는 되풀이하지 말라고, 받아 쓰는 단계에는 바탕으로 쓰라고 한다", () => {
  const done = [{ label: "머리기사", content: "1948년 8월 15일 정부 수립 선포식이 열렸다." }];
  const share = previousStepsBlock(done, "share");
  assert.ok(share.includes("다시 설명하지 말 것"));
  assert.ok(share.includes("다른 사실은 조사 노트에서 가져와도 된다"));
  const build = previousStepsBlock(done);
  assert.ok(build.includes("바탕으로 쓸 것"));
  assert.ok(build.includes("새로 가져오지 말 것"));
});
