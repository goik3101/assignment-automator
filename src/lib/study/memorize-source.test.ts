import { test } from "node:test";
import assert from "node:assert/strict";
import { readMemorizeSource, memorizeBlock, orderInstruction, termInstruction } from "./memorize-source.ts";

// 2026-11-12 과학(멸치) 결과물에서 그대로 가져온 모양
const SCIENCE = `## 멸치해부실험

멸치의 기관을 살펴보고 위 내용물을 관찰해 멸치의 먹이와 해양 생태계 내 위치를 알아보는 모둠 실험이다.

## 탐구 보고서

### 생태피라미드
생태피라미드는 먹이 관계에 따라 생물의 위치와 에너지의 흐름을 나타낸다. 바다에서는 식물플랑크톤이 광합성으로 양분을 만들고, 동물플랑크톤이 이를 먹으며, 멸치와 같은 작은 어류가 동물플랑크톤을 먹는다.[1]

### 생태계 평형
생태계 평형은 개체수가 전혀 변하지 않는 상태가 아니라, 여러 생물 사이의 관계가 이어지며 큰 변화가 오래 지속되지 않는 상태이다.[2]
멸치는 바다에 사는 작은 물고기다.

## 출처

1. 국가기록원 …`;

test("칸 이름을 쓰는 순서 그대로 읽는다", () => {
  const src = readMemorizeSource(SCIENCE);
  assert.deepEqual(src.boxes, ["멸치해부실험", "탐구 보고서"]);
  // 출처는 외울 칸이 아니다
  assert.ok(!src.boxes.includes("출처"));
});

test("각주가 붙은 문장만 외울 문장으로 본다", () => {
  const src = readMemorizeSource(SCIENCE);
  assert.equal(src.anchored.length, 2);
  assert.ok(src.anchored[1].sentence.includes("생태계 평형은"));
  // 각주 번호는 떼고 담는다
  assert.ok(!src.anchored[0].sentence.includes("[1]"));
  // **교과서 수준 일반 지식은 각주가 없어 자동으로 빠진다** — 이 규칙이 이 설계의 핵심이다.
  assert.ok(!src.anchored.some((a) => a.sentence.includes("바다에 사는 작은 물고기")));
});

test("프롬프트 블록에 칸 순서와 외울 문장이 들어간다", () => {
  const block = memorizeBlock(readMemorizeSource(SCIENCE));
  assert.match(block, /칸 순서/);
  assert.match(block, /1\. 멸치해부실험/);
  assert.match(block, /외울 문장/);
  assert.match(block, /\(탐구 보고서\)/);
});

test("외울 것이 없으면 아무것도 끼우지 않는다", () => {
  const plain = "## 머리기사\n\n광복 직후 서울은 혼란스러웠다.";
  const src = readMemorizeSource(plain);
  assert.equal(src.anchored.length, 0);
  assert.equal(termInstruction(src), "");
  // 칸이 하나뿐이면 순서를 말할 것이 없다
  assert.equal(orderInstruction(src), "");
  // 칸이 하나뿐이면 블록도 없다(2026-11-15: "칸 순서 1번 항목의 이름은?" 같은 무의미한 문제가 나왔다)
  assert.equal(memorizeBlock(src), "");
  // 단계 하나 안의 ### 항목이 둘 이상이면 그것이 칸이다
  const items = readMemorizeSource("## 평전\n\n### 배경\n글.\n\n### 업적\n글.\n\n### 평가\n글.");
  assert.deepEqual(items.boxes, ["배경", "업적", "평가"]);
  assert.match(memorizeBlock(items), /칸 순서/);
  assert.equal(memorizeBlock(readMemorizeSource("")), "");
});

test("칸이 둘 이상이면 요점을 칸 순서로 쓰게 한다", () => {
  const i = orderInstruction(readMemorizeSource(SCIENCE));
  assert.match(i, /2줄/);
  assert.match(i, /시험지에 쓰는 순서/);
});
