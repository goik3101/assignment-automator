import { test } from "node:test";
import assert from "node:assert/strict";
import {
  distinctHostCount,
  evidenceResearchBlock,
  evidenceTopUpBlock,
  needsMoreEvidence,
  planEvidence,
  type EvidenceElement,
} from "./evidence-slots.ts";

// 실제 안내문(공통국어2 매체 활용 주제발표)을 분석시킨 결과에서 옮긴 자료 — requirement-scope.test.ts와 같은 출처.
const OUTLINE: EvidenceElement = {
  label: "개요",
  description: "글의 목적·주제·예상 독자를 설정하고 중심 내용과 세부 내용을 구상하며, 근거 정보와 출처를 정리하는 개요를 작성한다.",
  required_items: ["글의 목적", "주제", "예상 독자", "중심 내용", "세부 내용", "근거 정보", "근거자료 출처"],
};
const BOARD: EvidenceElement = {
  label: "스토리보드",
  description: "개요에서 생성한 내용을 바탕으로 8개의 장면으로 스토리보드를 작성하고 시각 이미지를 탑재한다.",
};
const REQUIREMENTS = [
  "개요와 스토리보드를 모두 작성하며, 두 결과물 모두 점수에 반영됨.",
  "내용을 뒷받침하는 정보(근거)를 3가지 이상 수집하고, 출처를 명확히 밝힌 적절한 근거자료를 사용할 것.",
  "개요에서 생성한 내용을 바탕으로 8개의 장면으로 스토리보드를 작성할 것. 8개가 기본이며 10개까지 가능함.",
  "찬반은 세트로 발표하며, 찬성 먼저 또는 반대 바로 다음 순서로 발표함.",
];
const INFO = { topic: "매체를 활용한 의견 발표", requirements: REQUIREMENTS, task_elements: [OUTLINE, BOARD] };

test("안내문의 '근거를 3가지 이상'을 근거 슬롯 3개로 읽고, 근거를 쓰는 단계를 찾는다", () => {
  const plan = planEvidence(INFO, "인터넷 실명제 반대 입장으로 써줘");
  assert.equal(plan.slots, 3);
  assert.equal(plan.label, "개요");
  assert.equal(plan.stance, "반대");
});

test("번호가 붙은 근거 항목이 있으면 그 개수를 쓴다(개수 조건보다 우선)", () => {
  const el: EvidenceElement = {
    label: "논설문",
    description: "주장을 정하고 근거를 들어 논설문을 쓴다.",
    required_items: ["주장", "근거 1", "근거 2", "근거 3", "근거 4", "맺음말"],
  };
  const plan = planEvidence({ topic: "논설문 쓰기", requirements: ["근거를 2가지 제시할 것"], task_elements: [el] });
  assert.equal(plan.slots, 4);
});

test("근거 항목은 있는데 개수가 없으면 최소 2개로 본다 — '근거자료 출처'는 근거 항목이 아니다", () => {
  const el: EvidenceElement = { label: "개요", description: "개요를 쓴다.", required_items: ["주제", "근거 정보", "근거자료 출처"] };
  assert.equal(planEvidence({ topic: "의견 발표", requirements: [], task_elements: [el] }).slots, 2);
  const onlySource: EvidenceElement = { label: "개요", description: "개요를 쓴다.", required_items: ["주제", "근거자료 출처"] };
  assert.equal(planEvidence({ topic: "의견 발표", requirements: [], task_elements: [onlySource] }).slots, 0);
});

test("근거를 요구하지 않는 과제는 슬롯이 0이고 조사 프롬프트가 바뀌지 않는다", () => {
  const el: EvidenceElement = { label: "독서 감상문", description: "책을 읽고 인상 깊은 장면을 중심으로 감상문을 쓴다." };
  const plan = planEvidence({ topic: "독서 감상문", requirements: ["800자 내외로 쓸 것"], task_elements: [el] });
  assert.equal(plan.slots, 0);
  assert.equal(evidenceResearchBlock(plan), "");
});

test("입장은 주장하는 글에서만 읽고, 낱말 속 '반대로'는 입장으로 보지 않는다", () => {
  assert.equal(planEvidence(INFO, "반대로 생각해 보면 어떨까").stance, null);
  // 주장하는 글이 아니면 입장을 찾지 않는다
  const science: EvidenceElement = { label: "탐구 보고서", description: "실험 결과를 정리하고 근거 2가지를 들어 결론을 쓴다." };
  assert.equal(planEvidence({ topic: "산과 염기 탐구", requirements: [], task_elements: [science] }, "반대").stance, null);
  // 여러 번 나오면 마지막(학생이 고른 쪽)
  assert.equal(planEvidence(INFO, "찬성과 반대 중에서 반대").stance, "반대");
});

test("조사 프롬프트 블록은 근거 수·축·입장을 적는다", () => {
  const block = evidenceResearchBlock(planEvidence(INFO, "인터넷 실명제 반대"));
  assert.match(block, /서로 다른 근거 3개/);
  assert.match(block, /"개요" 단계/);
  assert.match(block, /서로 다른 축/);
  assert.match(block, /입장은 "반대"/);
});

test("보강 조사 블록은 이미 확보한 사실을 보여 주고 다른 축만 더 모으게 한다", () => {
  const block = evidenceTopUpBlock(planEvidence(INFO, "반대"), ["2012년 헌법재판소가 인터넷 실명제를 위헌으로 결정했다."]);
  assert.match(block, /이미 확보한 근거/);
  assert.match(block, /2012년 헌법재판소/);
  assert.match(block, /다른 축의 근거를 2개만 더/);
});

test("보강 여부는 서로 다른 페이지 수로 판정한다(www·끝 슬래시는 같은 곳)", () => {
  const urls = ["https://www.a.org/x", "https://a.org/y", "https://b.go.kr/z"];
  assert.equal(distinctHostCount(urls), 2);
  const plan = planEvidence(INFO, "반대");
  assert.equal(needsMoreEvidence(plan, urls), true);
  assert.equal(needsMoreEvidence(plan, [...urls, "https://c.re.kr/q"]), false);
  assert.equal(needsMoreEvidence({ slots: 0, stance: null, label: null }, []), false);
});
