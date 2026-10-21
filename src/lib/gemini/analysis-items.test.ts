import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyAnalysisItem, splitAnalysisItems } from "./analysis-items.ts";

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

test("칸 이름뿐인 항목(제목·내용)은 버린다(실측: 머리기사 '제목, 내용 비어 있어요' 거짓 경고)", () => {
  assert.deepEqual(splitAnalysisItems(["제목", "내용", "사진/그림/지도"]).content, ["사진/그림/지도"]);
  assert.deepEqual(splitAnalysisItems(["카드 뉴스 제목", "전달하고자 하는 메시지"]).content, ["카드 뉴스 제목", "전달하고자 하는 메시지"]);
});

test("내용 항목은 그대로 둔다", () => {
  for (const item of ["인물 배경", "주요 활동", "질문1", "답변1", "사진/그림/지도", "원인", "해결 방안", "패널 ⑥", "가설", "준비물"]) {
    assert.equal(classifyAnalysisItem(item), "content", item);
  }
});
