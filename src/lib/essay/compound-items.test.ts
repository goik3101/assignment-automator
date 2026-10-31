import { test } from "node:test";
import assert from "node:assert/strict";
import { compoundItemBlock, compoundItems, compoundRepairText, missingParts, sectionTextFor, splitCompoundItem } from "./compound-items.ts";

test("나열 기호로 묶인 항목 이름을 쪼갠다", () => {
  assert.deepEqual(splitCompoundItem("글의 목적·주제·예상 독자"), ["글의 목적", "주제", "예상 독자"]);
  assert.deepEqual(splitCompoundItem("원인, 양상, 영향"), ["원인", "양상", "영향"]);
});

test("같은 끝말로 이어진 '과/와'만 나열로 본다", () => {
  assert.deepEqual(splitCompoundItem("중심 내용과 세부 내용"), ["중심 내용", "세부 내용"]);
  // 끝말이 다르면 한 덩어리다 — 여기서 쪼개면 "산"이 항목이 되어 버린다.
  assert.equal(splitCompoundItem("산과 염기의 특징"), null);
  assert.equal(splitCompoundItem("실험 과정과 결과 해석"), null);
});

test("한 가지를 가리키는 이름은 건드리지 않는다", () => {
  for (const n of ["출처", "느낀 점", "뒷받침하는 정보 3가지 이상", "근거 자료 3가지", "장면 1", ""])
    assert.equal(splitCompoundItem(n), null, n);
});

test("개수 조건이 붙은 이름은 나열로 보지 않는다", () => {
  assert.equal(splitCompoundItem("사례·통계 3가지 이상"), null);
});

test("프롬프트 블록은 나열된 항목만 담고, 없으면 빈 문자열", () => {
  const items = compoundItems(["글의 목적·주제·예상 독자", "중심 내용과 세부 내용", "출처", "뒷받침하는 정보 3가지 이상"]);
  assert.equal(items.length, 2);
  const b = compoundItemBlock(items);
  assert.ok(b.includes('"예상 독자: …"'));
  assert.ok(b.includes('"세부 내용: …"'));
  assert.ok(!b.includes("출처"));
  assert.equal(compoundItemBlock([]), "");
});

test("항목 구간을 소제목으로 찾는다", () => {
  const md = "## 개요\n\n### 글의 목적·주제·예상 독자\n목적: 설득한다.\n\n### 출처\n- a: https://x";
  const sec = sectionTextFor(md, "글의 목적·주제·예상 독자");
  assert.ok(sec && sec.includes("목적: 설득한다."));
  assert.ok(sec && !sec.includes("https://x"));
  assert.equal(sectionTextFor(md, "없는 항목"), null);
});

test("줄머리 표지로 나온 조각은 찾은 것으로 본다", () => {
  const sec = "목적: 반대 입장을 설명한다.\n주제: 인터넷 실명제를 도입해야 하는가.\n예상 독자: 같은 반 학생들.";
  assert.deepEqual(missingParts(sec, ["글의 목적", "주제", "예상 독자"]), []);
  // 굵게·불릿으로 적어도 인정한다.
  assert.deepEqual(missingParts("- **주제**: x\n- 예상 독자: y", ["주제", "예상 독자"]), []);
});

test("한 문단에 뭉쳐 있으면 전부 빠진 것으로 본다", () => {
  const sec = "인터넷 실명제 도입에 반대하는 입장을 설명하는 것이 목적이다. 주제는 '실명제를 도입해야 하는가'이며 예상 독자는 반 친구들이다.";
  assert.deepEqual(missingParts(sec, ["글의 목적", "주제", "예상 독자"]), ["글의 목적", "주제", "예상 독자"]);
});

test("일부만 빠지면 그것만 알려준다", () => {
  const sec = "목적: 설득한다.\n주제: 실명제 도입 여부.\n그리고 반 친구들이 들을 것이다.";
  assert.deepEqual(missingParts(sec, ["글의 목적", "주제", "예상 독자"]), ["예상 독자"]);
});

test("보완 지시는 빠진 것과 쓸 모양을 함께 말하고 각주는 두라고 한다", () => {
  const t = compoundRepairText("글의 목적·주제·예상 독자", ["글의 목적", "주제", "예상 독자"], ["예상 독자"]);
  assert.ok(t.includes('"예상 독자"'));
  assert.ok(t.includes("각주"));
  const all = compoundRepairText("글의 목적·주제·예상 독자", ["글의 목적", "주제", "예상 독자"], ["글의 목적", "주제", "예상 독자"]);
  assert.ok(all.includes("한 문단에 뭉쳐"));
});
