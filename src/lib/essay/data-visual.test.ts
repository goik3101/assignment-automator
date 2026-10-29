import { test } from "node:test";
import assert from "node:assert/strict";
import { dataTableInstruction, hasDataTable, needsDataTable } from "./data-visual.ts";

test("안내문이 표·그래프를 말할 때만 걸린다", () => {
  assert.equal(needsDataTable({ label: "정책 제안서", description: "문제의 현황을 그래프로 제시한다." }), true);
  assert.equal(needsDataTable({ label: "보고서", description: "조사 결과를 표로 정리한다." }), true);
  assert.equal(needsDataTable({ label: "탐구", description: "결과", required_items: ["실험 결과 도표"] }), true);
  // 단계 이름을 말한 요구사항에서도 읽는다
  assert.equal(
    needsDataTable({ label: "정책 제안서", description: "해결 방안을 제안한다." }, ["정책 제안서에는 통계 그래프를 넣을 것"]),
    true
  );
  // 다른 단계의 조건은 가져오지 않는다
  assert.equal(needsDataTable({ label: "개요", description: "개요를 쓴다." }, ["스토리보드에는 그래프를 넣을 것"]), false);
  // 단계가 하나뿐이면 안내문 조건이 전부 그 단계의 것이다(실제 안내문은 긴 단계 이름을 요구사항에 그대로 적지 않는다)
  assert.equal(needsDataTable({ label: "경제 문제 분석 및 소견 평가지", description: "분석한다." }, ["평가지에 관련 통계를 그래프로 제시할 것"], undefined, true), true);
  assert.equal(needsDataTable({ label: "경제 문제 분석 및 소견 평가지", description: "분석한다." }, ["평가지에 관련 통계를 그래프로 제시할 것"]), true);
  // "발표·표현·대표"처럼 낱말 속 글자에 걸리지 않는다
  assert.equal(needsDataTable({ label: "발표 대본", description: "자신의 의견을 표현하는 대본을 쓴다." }), false);
  assert.equal(needsDataTable({ label: "독서 감상문", description: "책을 읽고 느낀 점을 쓴다." }, ["800자 내외"]), false);
});

test("마크다운 표가 실제로 있는지 본다", () => {
  const withTable = `설명 문장\n\n| 연도 | 빈곤율 |\n| --- | --- |\n| 2011 | 57.0% |\n| 2023 | 55.5% |\n\n이어지는 문장`;
  assert.equal(hasDataTable(withTable), true);
  // 실측에서 나온 "설명으로 대체" 형태
  const fake = `(그래프) 2011년~2023년 65세 이상 노인 상대적 빈곤율\n\n2011: 57.0%\n2023: 55.5%`;
  assert.equal(hasDataTable(fake), false);
  assert.equal(hasDataTable("| 머리 |\n| --- |\n| 숫자 없음 |"), false);
});

test("해당 단계가 없으면 프롬프트에 아무것도 넣지 않는다", () => {
  assert.equal(dataTableInstruction([]), "");
  assert.match(dataTableInstruction(["정책 제안서"]), /마크다운 표로 직접/);
});
