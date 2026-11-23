import { test } from "node:test";
import assert from "node:assert/strict";
import { readMemorizeSource, memorizeBlock, hasNamedItems } from "./memorize-source.ts";

// 2026-11-12 과학(멸치) 결과물에서 그대로 가져온 모양
const SCIENCE = `## 멸치해부실험

멸치의 기관을 살펴보고 위 내용물을 관찰해 멸치의 먹이와 해양 생태계 내 위치를 알아보는 모둠 실험이다.

## 탐구 보고서

### 생태피라미드
생태피라미드는 먹이 관계에 따라 생물의 위치와 에너지의 흐름을 나타낸다.[1]

### 생태계 평형
생태계 평형은 개체수가 전혀 변하지 않는 상태가 아니다.[2]

## 출처

1. 국가기록원 …`;

test("칸 이름을 쓰는 순서 그대로 읽고, 출처는 칸이 아니다", () => {
  const src = readMemorizeSource(SCIENCE);
  assert.deepEqual(src.boxes, ["멸치해부실험", "탐구 보고서"]);
  assert.ok(!src.boxes.includes("출처"));
});

test("프롬프트 블록은 칸 순서만 담는다", () => {
  const block = memorizeBlock(readMemorizeSource(SCIENCE));
  assert.match(block, /칸 순서/);
  assert.match(block, /1\. 멸치해부실험/);
  assert.doesNotMatch(block, /외울 문장/);
});

test("칸이 하나뿐이면 블록이 없다 — 단계 하나 안의 ### 항목이 둘 이상이면 그것이 칸이다", () => {
  const plain = readMemorizeSource("## 머리기사\n\n광복 직후 서울은 혼란스러웠다.");
  // 2026-11-15: "칸 순서 1번 항목의 이름은?" 같은 무의미한 문제가 나왔다
  assert.equal(memorizeBlock(plain), "");
  const items = readMemorizeSource("## 평전\n\n### 배경\n글.\n\n### 업적\n글.\n\n### 평가\n글.");
  assert.deepEqual(items.boxes, ["배경", "업적", "평가"]);
  assert.match(memorizeBlock(items), /칸 순서/);
});

test("단계 아래 이름 있는 항목을 outline으로 담는다", () => {
  const md = ["## 개요", "### 글의 목적", "목적 글.", "### 예상 독자", "독자 글.", "## 근거 자료", "근거 글.[1]", "## 스토리보드", "### 장면 1", "a", "### 장면 2", "b", "## 출처", "### 링크"].join("\n");
  const src = readMemorizeSource(md);
  assert.deepEqual(src.outline, [
    { box: "개요", items: ["글의 목적", "예상 독자"] },
    { box: "근거 자료", items: [] },
    { box: "스토리보드", items: ["장면 1", "장면 2"] },
  ]);
  assert.ok(hasNamedItems(src));
  assert.ok(!hasNamedItems(readMemorizeSource(["## 가", "글", "## 나", "글"].join("\n"))));
});
