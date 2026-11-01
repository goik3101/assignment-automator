import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyAnalysisItem, isFormFieldItem, splitAnalysisItems } from "./analysis-items.ts";

test("채점 조건과 사진 준비 항목을 내용 항목에서 떼어낸다(실측: 영어 발명품 제안서)", () => {
  const items = [
    "발명품 사진 제시 여부",
    "영어 120단어 이상",
    "발명품의 용도 (purpose)",
    "발명품의 특징 및 장점(구체적 설명)",
    "발명품의 한계점 또는 문제점(구체적 설명)",
    "한계점과 관련한 구체적·적절한 개선안",
    "수동태 사용(해당 어법에 밑줄 표시)",
    "It~that 강조 사용(해당 어법에 밑줄 표시)",
    "관계대명사 사용(해당 어법에 밑줄 표시)",
  ];
  const r = splitAnalysisItems(items);
  assert.deepEqual(r.content, ["발명품의 용도 (purpose)", "발명품의 특징 및 장점(구체적 설명)", "발명품의 한계점 또는 문제점(구체적 설명)", "한계점과 관련한 구체적·적절한 개선안"]);
  assert.equal(r.conditions.length, 4);
  assert.deepEqual(r.visuals, ["발명품 사진 제시 여부"]);
});

test("양식지 칸 이름(제목·내용)도 항목으로 센다 — 2026-11-01에 되돌림", () => {
  // 예전에는 버렸다(거짓 경고 때문). 이제는 항목으로 남기고 누락 경고에서만 뺀다 —
  // 버린 동안 머리기사·사설이 "제목/내용" 칸 없이 생성돼 양식 점수를 받지 못했다(사용자 결과물.10).
  assert.deepEqual(splitAnalysisItems(["제목", "내용", "사진/그림/지도"]).content, ["제목", "내용", "사진/그림/지도"]);
  assert.deepEqual(splitAnalysisItems(["카드 뉴스 제목", "전달하고자 하는 메시지"]).content, ["카드 뉴스 제목", "전달하고자 하는 메시지"]);
});

test("내용 항목은 그대로 둔다", () => {
  for (const item of ["인물 배경", "주요 활동", "질문1", "답변1", "사진/그림/지도", "원인", "해결 방안", "패널 ⑥", "가설", "준비물"]) {
    assert.equal(classifyAnalysisItem(item), "content", item);
  }
});

test("양식지 칸 이름(제목·내용)은 항목으로 센다", () => {
  // 2026-10-22에 버렸던 결정을 되돌렸다 — 거짓 경고가 문제였지 칸이 틀린 게 아니었다(실측: 결과물.10의 머리기사·사설).
  assert.equal(classifyAnalysisItem("제목"), "content");
  assert.equal(classifyAnalysisItem("내용"), "content");
  assert.deepEqual(splitAnalysisItems(["제목", "내용"]).content, ["제목", "내용"]);
  // 누락 경고에서는 빼도록 표시만 해 둔다.
  assert.equal(isFormFieldItem("제목"), true);
  assert.equal(isFormFieldItem("인터뷰 대상"), false);
});

test("채점 기준 문장은 칸이 아니다", () => {
  // 실측(2026-11-01 역사 신문): "역사적 사실과 어긋나는 사실이 없는 내용"이 사설의 소제목이 될 뻔했다.
  for (const i of ["역사적 사실과 어긋나는 사실이 없는 내용", "논리적인 주장", "구체적인 서술", "사실과 일치하는 내용"])
    assert.equal(classifyAnalysisItem(i), "condition", i);
});

test("꾸밈말 없는 진짜 칸은 그대로 둔다", () => {
  for (const i of ["전달하고자 하는 메시지", "국내 또는 해외에 미치는 영향", "주장", "근거", "인터뷰 대상", "해결 방안"])
    assert.equal(classifyAnalysisItem(i), "content", i);
});
