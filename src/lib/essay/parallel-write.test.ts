import { test } from "node:test";
import assert from "node:assert/strict";
import { itemGroups, itemWriteInstruction, mergeItemParts, mergeParallelParts, parallelWriteInstruction, parallelWriteOn } from "./parallel-write.ts";

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

test("항목을 나눠 쓰는 호출은 자기 몫의 분량을 받는다", () => {
  const all = ["가", "나", "다", "라", "마", "바", "사", "아", "자"];
  const mine = all.slice(0, 4);
  const withTarget = itemWriteInstruction("카드뉴스", mine, all, true, 2050);
  // 2050 × 4/9 ≈ 911 → 50자 단위로 900
  assert.match(withTarget, /네가 쓸 분량은 공백 포함 약 900자/);
  assert.match(withTarget, /항목 9개 중 4개/);
  // 목표가 없으면 분량 줄도 없다(예전 그대로)
  assert.doesNotMatch(itemWriteInstruction("카드뉴스", mine, all, true), /네가 쓸 분량/);
  // 몫이 너무 작으면 숫자를 주지 않는다(50자 같은 값은 지시가 아니라 방해다)
  assert.doesNotMatch(itemWriteInstruction("표어", ["가"], all, true, 300), /네가 쓸 분량/);
});

test("단계별 호출에 그 단계의 목표 분량을 적는다 (전수 측정: 같은 칸이 214~930자로 갈렸다)", () => {
  const withTarget = parallelWriteInstruction("머리기사", ["머리기사", "인터뷰", "사설/칼럼"], true, 600);
  assert.ok(withTarget.includes("약 600자"), "목표가 안 적혔다");
  assert.ok(withTarget.includes("500~700자 안에 들어오게"), "허용 범위(±20%, 50자 단위)가 안 적혔다");
  assert.ok(withTarget.includes("이 숫자만 지킨다"), "다른 단계 숫자와 구분하라는 말이 없다");
  assert.ok(!withTarget.includes("넘기지 말 것"), "기각된 상한 문구가 돌아왔다");
  // 목표가 없거나 너무 작으면 아무 말도 더하지 않는다(그림 칸 등)
  assert.equal(parallelWriteInstruction("만평/광고", ["머리기사", "만평/광고"], false), parallelWriteInstruction("만평/광고", ["머리기사", "만평/광고"], false, undefined));
  assert.ok(!parallelWriteInstruction("만평/광고", ["머리기사", "만평/광고"], false, 50).includes("분량:"));
});
