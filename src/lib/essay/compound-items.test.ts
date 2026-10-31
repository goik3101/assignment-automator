import { test } from "node:test";
import assert from "node:assert/strict";
import { allCompoundItems, compoundItemBlock, compoundItems, compoundItemsFromText, compoundRepairText, missingParts, sectionTextFor, splitCompoundItem } from "./compound-items.ts";

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

test("안내문 문장에서도 나열된 항목을 뽑는다", () => {
  // 실측: required_items가 비어 있는 실행이 절반이라 거기에만 기대면 이 규칙이 절반만 돈다.
  const items = compoundItemsFromText([
    "개요에는 글의 목적, 주제, 예상 독자를 구체적으로 설정하고, 그에 맞게 중심 내용과 세부 내용을 구상한다.",
  ]);
  const parts = items.map((i) => i.parts.join("|"));
  assert.ok(parts.includes("글의 목적|주제|예상 독자"), JSON.stringify(parts));
  assert.ok(parts.includes("중심 내용|세부 내용"), JSON.stringify(parts));
});

test("나열이 아닌 문장에서는 아무것도 뽑지 않는다", () => {
  assert.deepEqual(
    compoundItemsFromText([
      "내용을 뒷받침하는 정보를 3가지 이상 수집한다.",
      "산과 염기의 특징을 설명한다.",
      "스토리보드를 8개의 장면으로 작성한다.",
      undefined,
    ]),
    []
  );
});

test("항목 이름과 안내문 글에서 같은 것이 나오면 한 번만 센다", () => {
  const both = allCompoundItems(
    ["글의 목적·주제·예상 독자"],
    ["개요에는 글의 목적, 주제, 예상 독자를 구체적으로 설정한다."]
  );
  assert.equal(both.length, 1);
  // 항목 이름이 비어 있어도 안내문 글에서 뽑는다.
  assert.equal(allCompoundItems([], ["글의 목적, 주제, 예상 독자를 구체적으로 설정한다."]).length, 1);
});

test("문장을 잘못 끊어 조각이 길어지면 믿지 않는다", () => {
  // 안내문에 없는 이름으로 "빠졌다"고 보완을 부르면 글만 망가진다.
  assert.deepEqual(
    compoundItemsFromText(["작년 한 해 동안 학급에서 겪은 여러 가지 어려움과 그것을 이겨 내기 위해 노력한 과정을 정리한다."]),
    []
  );
});

test("자리말이 여러 낱말이어도 뗀다", () => {
  const items = compoundItemsFromText(["한 경제 문제에 대해 주제와 선정 이유, 원인, 양상, 해결 방안을 작성할 것"]);
  assert.equal(items.length, 1);
  assert.equal(items[0].parts[0], "주제와 선정 이유");
  assert.ok(items[0].parts.includes("해결 방안"));
});
