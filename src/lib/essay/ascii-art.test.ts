import { test } from "node:test";
import assert from "node:assert/strict";
import { isAsciiArt, stripAsciiArt } from "./ascii-art.ts";

const PEN = ["__________________________________", "/_________________________________/|", "| ||", "| BIRO PEN ||", "|__________________________________|/"].join("\n");

test("기호로 그린 그림을 알아본다", () => {
  assert.ok(isAsciiArt(PEN));
});

test("글자가 대부분인 블록은 그림이 아니다", () => {
  assert.ok(!isAsciiArt("It is the rolling ball that transfers ink onto the paper."));
  assert.ok(!isAsciiArt("가. 실험 준비물\n나. 실험 과정\n다. 결과 정리"));
});

test("짧은 것은 건드리지 않는다", () => {
  assert.ok(!isAsciiArt("|a|"));
});

test("그림 블록만 빼고 나머지는 둔다", () => {
  const md = `### Product\nA pen\n\n\`\`\`text\n${PEN}\n\`\`\`\n\n### Purposes\nIt is used for notes.`;
  const r = stripAsciiArt(md);
  assert.equal(r.removed.length, 1);
  assert.ok(!r.content.includes("BIRO PEN"));
  assert.ok(r.content.includes("### Purposes"));
  assert.ok(r.content.includes("A pen"));
});

test("그림이 없으면 글을 그대로 둔다", () => {
  const md = "### 결과\n리트머스 종이가 붉게 변했다.\n\n| 물질 | 액성 |\n|---|---|\n| 식초 | 산성 |";
  assert.equal(stripAsciiArt(md).content, md);
  assert.equal(stripAsciiArt(md).removed.length, 0);
});
