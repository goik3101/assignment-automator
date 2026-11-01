import { test } from "node:test";
import assert from "node:assert/strict";
import { blankPastedMetadata } from "./paste-slot.ts";

const SLOT = "제목: [직접 작성: 기사 제목]\n날짜: 2025년 1월 2일\n출처: 서울신문\n\n[붙일 자료: 기사 본문 — 출력해서 붙일 것]";

test("붙이는 칸의 지어낸 서지를 빈칸으로 되돌린다", () => {
  const r = blankPastedMetadata(SLOT);
  assert.equal(r.blanked.length, 2);
  assert.ok(r.content.includes("날짜: [직접 작성: 붙인 기사의 날짜]"));
  assert.ok(r.content.includes("출처: [직접 작성: 붙인 기사의 출처]"));
});

test("이미 빈칸인 줄은 건드리지 않는다", () => {
  const r = blankPastedMetadata(SLOT);
  assert.ok(r.content.includes("제목: [직접 작성: 기사 제목]"));
  assert.ok(!r.blanked.some((b) => b.label === "제목"));
});

test("붙임 표시가 없는 글은 손대지 않는다(실험 날짜 등)", () => {
  const t = "날짜: 2026년 3월 2일\n실험을 시작했다.";
  const r = blankPastedMetadata(t);
  assert.equal(r.content, t);
  assert.equal(r.blanked.length, 0);
});

test("서지가 아닌 줄은 그대로 둔다", () => {
  const t = "[붙일 자료: 기사]\n주제: 노인 빈곤 문제\n원인: 연금이 적다.";
  assert.equal(blankPastedMetadata(t).blanked.length, 0);
});
