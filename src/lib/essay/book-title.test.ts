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

import { isPlausibleBookTitle } from "./book-title.ts";

test("책 대신 안내 문장을 제목으로 돌려준 후보는 거른다(역사-05 '예시 안내…원하나요?')", () => {
  for (const bad of ["예시 안내: 학교 수행평가에 바로 쓸 수 있는 자료 유형을 원하나요?", "온라인 자료 검색 허가 요청", "책을 찾아 드릴까요?", ""]) assert.equal(isPlausibleBookTitle(bad), false, bad);
  for (const ok of ["미움받을 용기", "나는 누구인가?", "역사란 무엇인가", "내 이름은 라임오렌지나무", "사피엔스: 유인원에서 사이보그까지"]) assert.equal(isPlausibleBookTitle(ok), true, ok);
});

import { looksHedgedBookTitle } from "./book-title.ts";

test("모르는 책을 얼버무린 후보는 걸러내고 진짜 제목(영어 원제 괄호 포함)은 둔다(2026-11-27 과학-03)", () => {
  assert.equal(looksHedgedBookTitle("넬슨의 화학이야기 번역본(일상 속 화학 설명서류)"), true);
  assert.equal(looksHedgedBookTitle("원소로 보는 세계사(또는 원소 중심 교양서)"), true);
  assert.equal(looksHedgedBookTitle("넬슨의 화학이야기 번역본"), true);
  assert.equal(looksHedgedBookTitle("주기율표(The Periodic Table)"), false);
  assert.equal(looksHedgedBookTitle("사라지는 숟가락"), false);
  assert.equal(looksHedgedBookTitle("정재승의 과학 콘서트"), false);
  process.env.BOOK_HEDGE = "off";
  try {
    assert.equal(looksHedgedBookTitle("원소로 보는 세계사(또는 교양서)"), false);
  } finally {
    delete process.env.BOOK_HEDGE;
  }
});
