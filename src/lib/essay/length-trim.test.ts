import { test } from "node:test";
import assert from "node:assert/strict";
import { bodyLines, buildTrimModel, lineBudgets, renderTrimmed, replaceLines, trimStopAt, trimToRange } from "./length-trim.ts";

const words = (t: string) => (t.replace(/\[\d+\]/g, " ").match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g) ?? []).length;
const chars = (t: string) => t.length;

const ENG = [
  "### Product",
  "LifeStraw is a portable water filter. It was released in 2005[1]. Many hikers carry it on trips. People also use it during floods.",
  "",
  "### Features",
  "The filter uses a hollow fiber membrane[2]. It is the membrane that blocks bacteria. Water is cleaned quickly. The design is light and simple. Some users like the bright color.",
].join("\n");

test("소제목·빈 줄은 그대로, 문장 단위로 나뉜다(각주가 문장 끝에 붙어도)", () => {
  const m = buildTrimModel(ENG);
  assert.equal(renderTrimmed(m, new Set()), ENG);
  assert.equal(m.units.length, 9);
  assert.ok(m.units[0].locked && m.units[4].locked); // 줄의 첫 문장
  assert.ok(m.units[1].text.endsWith("2005[1]."));
});

test("모델이 준 순서대로 지우다 목표에 닿으면 멈추고 범위 안에 들어온다", () => {
  const m = buildTrimModel(ENG);
  const before = words(ENG);
  const res = trimToRange(m, [3, 8, 7, 2], words, { min: 20, max: before - 12 });
  assert.ok(res.inRange);
  assert.ok(res.count <= before - 12 && res.count >= 20);
  assert.ok(res.removed.includes(3));
  assert.ok(res.text.includes("### Product") && res.text.includes("### Features"));
});

test("순서가 모자라거나 잘못돼도 코드가 이어서 지워 범위에 닿는다(잠긴 문장·없는 번호는 무시)", () => {
  const m = buildTrimModel(ENG);
  const res = trimToRange(m, [0, 4, 99, -1], words, { min: 15, max: 30 });
  assert.ok(res.inRange, JSON.stringify(res));
  assert.ok(res.text.startsWith("### Product\nLifeStraw is a portable water filter."));
});

test("하한 밑으로 내려가는 삭제는 하지 않는다", () => {
  const m = buildTrimModel(ENG);
  const res = trimToRange(m, [1, 2, 3, 5, 6, 7, 8], words, { min: 30, max: 36 });
  assert.ok(res.count >= 30);
});

test("accept가 거부하는 삭제(각주·채점 대상 문장)는 건너뛴다", () => {
  const m = buildTrimModel(ENG);
  const accept = (t: string) => t.includes("[1]") && t.includes("[2]") && t.includes("It is the membrane that blocks bacteria.");
  const res = trimToRange(m, [2, 5, 6, 3, 7, 8], words, { min: 10, max: 25 }, accept);
  assert.ok(res.text.includes("2005[1]") && res.text.includes("membrane[2]") && res.text.includes("It is the membrane that blocks"));
});

test("굵은 문장·직접 인용·본문에 한 번만 나온 각주 문장은 잠긴다", () => {
  const m = buildTrimModel("첫 문장입니다. **굵은 문장입니다.** 그는 \"이것은 인용문이다\"라고 말했다. 각주가 있다[3]. 일반 문장이다. 또 다른 일반 문장이다.");
  const lockedTexts = m.units.filter((u) => u.locked).map((u) => u.text);
  assert.ok(lockedTexts.some((t) => t.includes("굵은")));
  assert.ok(lockedTexts.some((t) => t.includes("인용문")));
  assert.ok(lockedTexts.some((t) => t.includes("[3]")));
  assert.ok(!lockedTexts.some((t) => t.includes("또 다른 일반")));
});

test("한국어 글자 수 기준에서도 문단·소제목 구조를 유지하며 줄인다", () => {
  const ko = "### 도입\n오늘 발표에서는 소셜 미디어를 이야기합니다. 먼저 현황을 짚습니다. 이어서 문제를 말합니다. 마지막으로 대안을 제안합니다.\n\n### 마무리\n정리하면 균형이 중요합니다. 감사합니다. 질문을 받겠습니다.";
  const res = trimToRange(buildTrimModel(ko), [], chars, { min: 40, max: ko.length - 20 });
  assert.ok(res.inRange);
  assert.ok(res.text.includes("### 도입") && res.text.includes("\n\n### 마무리\n"));
});

test("trimStopAt: 범위가 있으면 상한 아래 25% 지점, 상한만 있으면 92%, 상한이 없으면 무한", () => {
  assert.equal(trimStopAt(120, 190), 173);
  assert.equal(trimStopAt(0, 100), 92);
  assert.equal(trimStopAt(50, 0), Infinity);
});

test("줄 단위 예산: 같은 비율로 줄이고, 이미 작은 줄은 건드리지 않는다", () => {
  const b = lineBudgets([{ index: 1, size: 40 }, { index: 3, size: 30 }, { index: 5, size: 5 }], 10, 55);
  assert.equal(b.get(1), 24); // 비율 45/75=0.6
  assert.equal(b.get(3), 18);
  assert.ok(!b.has(5));
});

test("본문 줄만 뽑고 글머리표는 보존하며 바꿔 끼운다", () => {
  const c = "### A\n- 첫 항목입니다.\n\n본문 문단입니다.";
  const lines = bodyLines(c);
  assert.deepEqual(lines.map((l) => [l.index, l.prefix, l.text]), [[1, "- ", "첫 항목입니다."], [3, "", "본문 문단입니다."]]);
  assert.equal(replaceLines(c, new Map([[1, "짧게."]])), "### A\n- 짧게.\n\n본문 문단입니다.");
});
