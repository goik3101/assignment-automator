import { test } from "node:test";
import assert from "node:assert/strict";
import { mainBookTitle } from "./book-title.ts";

test("같은 책의 다른 번역명이 괄호로 붙으면 본 제목만 남긴다 (2026-11-19 결과물)", () => {
  assert.equal(mainBookTitle("내 이름은 라임오렌지나무 (나의 라임 오렌지나무)"), "내 이름은 라임오렌지나무");
});

test("원제 괄호·전각 괄호도 뗀다", () => {
  assert.equal(mainBookTitle("콰이어트(Quiet)"), "콰이어트");
  assert.equal(mainBookTitle("완득이（개정판）"), "완득이");
});

test("괄호가 없으면 그대로", () => {
  assert.equal(mainBookTitle("엉클 텅스텐"), "엉클 텅스텐");
});

test("전부 괄호이거나 남는 글자가 너무 적으면 원래 제목을 둔다", () => {
  assert.equal(mainBookTitle("(1984)"), "(1984)");
});
