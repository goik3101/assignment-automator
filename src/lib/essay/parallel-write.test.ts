import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeParallelParts, parallelWriteInstruction, parallelWriteOn } from "./parallel-write.ts";

test("단계별로 따로 쓴 글을 요약 + 단계 순서대로 합치고, 남의 단계를 써도 버린다", () => {
  const parts = [
    "- 요약1\n- 요약2\n- 요약3\n\n## 1차시 고민 쓰기\n고민 본문[F1]\n\n## 2차시 분석\n쓰지 말라던 단계",
    "## 2차시 분석 [도서관]\n분석 본문",
    "제목 없이 쓴 편지 본문",
  ];
  assert.equal(
    mergeParallelParts(parts, ["1차시 고민 쓰기", "2차시 분석", "편지"]),
    "- 요약1\n- 요약2\n- 요약3\n\n## 1차시 고민 쓰기\n\n고민 본문[F1]\n\n## 2차시 분석\n\n분석 본문\n\n## 편지\n\n제목 없이 쓴 편지 본문"
  );
});

test("두 단계 이상일 때만 켜지고 ESSAY_PARALLEL_WRITE=off면 끈다", () => {
  assert.equal(parallelWriteOn(1), false);
  assert.equal(parallelWriteOn(2), true);
  process.env.ESSAY_PARALLEL_WRITE = "off";
  assert.equal(parallelWriteOn(3), false);
  delete process.env.ESSAY_PARALLEL_WRITE;
  assert.match(parallelWriteInstruction("편지", ["고민", "편지"], false), /"고민" 단계는 쓰지 말 것/);
});
