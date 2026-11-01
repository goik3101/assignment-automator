import { test } from "node:test";
import assert from "node:assert/strict";
import { splitUnderline, hasUnderline, underlineTree } from "./underline.ts";

test("밑줄 구간을 나눈다", () => {
  const segs = splitUnderline("It is <u>the filter</u> that works.");
  assert.deepEqual(segs, [
    { text: "It is ", underline: false },
    { text: "the filter", underline: true },
    { text: " that works.", underline: false },
  ]);
});

test("밑줄이 없으면 한 덩어리로 둔다", () => {
  assert.deepEqual(splitUnderline("plain text"), [{ text: "plain text", underline: false }]);
});

test("짝이 안 맞는 태그는 글자 그대로 둔다", () => {
  assert.deepEqual(splitUnderline("a <u>b"), [{ text: "a <u>b", underline: false }]);
});

test("한 문장에 여러 개도 나눈다", () => {
  const segs = splitUnderline("<u>A</u>와 <u>B</u>");
  assert.equal(segs.filter((s) => s.underline).length, 2);
});

test("hasUnderline", () => {
  assert.ok(hasUnderline("x <U>y</U> z"));
  assert.ok(!hasUnderline("x **y** z"));
});

test("트리의 글자 노드를 밑줄 노드로 바꾼다", () => {
  const tree = { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: "It <u>is kept</u> dry" }] }] };
  underlineTree(tree);
  const kids = tree.children[0].children as { type: string; value?: string; data?: { hName?: string } }[];
  assert.equal(kids.length, 3);
  assert.equal(kids[1].type, "underline");
  assert.equal(kids[1].data?.hName, "u");
});

test("코드 블록은 건드리지 않는다", () => {
  const tree = { type: "root", children: [{ type: "code", value: "<u>x</u>" }] };
  underlineTree(tree);
  assert.equal((tree.children[0] as { value?: string }).value, "<u>x</u>");
});

test("remark-parse가 떼어 놓은 html 노드 짝을 감싼다", () => {
  const tree = {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: "The bottle " },
          { type: "html", value: "<u>" },
          { type: "text", value: "is made" },
          { type: "html", value: "</u>" },
          { type: "text", value: " of steel." },
        ],
      },
    ],
  };
  underlineTree(tree);
  const kids = tree.children[0].children as { type: string; children?: { value?: string }[] }[];
  assert.equal(kids.length, 3);
  assert.equal(kids[1].type, "underline");
  assert.equal(kids[1].children?.[0].value, "is made");
});

test("닫는 태그가 없으면 글을 깨지 않는다", () => {
  const tree = { type: "root", children: [{ type: "paragraph", children: [{ type: "html", value: "<u>" }, { type: "text", value: "x" }] }] };
  underlineTree(tree);
  const kids = tree.children[0].children as { type: string; value?: string }[];
  assert.ok(kids.every((k) => k.type !== "underline"));
  assert.equal(kids.map((k) => k.value).join(""), "<u>x");
});
