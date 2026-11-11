import { test } from "node:test";
import assert from "node:assert/strict";
import { isTableForm, labelIsTable, tableColumns, tableRowLabels, wantsTotalRow, tableSpecs, tableFormBlock, tableStepLine } from "./table-form.ts";

// 2026-11-11 수학 안내문(실제 분석 결과 그대로)
const MATH_GUIDE =
  "1단계 양식 칸: ‘성취 기준’, ‘출제 의도 및 핵심 아이디어’. 문항 및 의도 배점은 8점이다. " +
  "4단계 표 칸: ‘문항 번호 / 평가 요소 / 세부 채점 기준 및 조건 / 배점’, 마지막에 ‘합계’. 분석적 채점표 배점은 10점이다.";
const MATH_TABLE = {
  label: "분석적 채점 기준표",
  description: "문항별 분석적 채점 기준표를 작성한다.",
  required_items: ["문항 번호", "평가 요소", "세부 채점 기준 및 조건", "배점", "합계"],
};

// 2026-11-11 사회 안내문
const SOCIAL_GUIDE =
  "사례 분석표: 사례1·사례2 각각 ‘해결해야 할 행동 / 적용된 경제적 유인(긍정·부정, 구체적으로) / 예상되는 행동의 변화 / 발생 가능한 문제점·더 나은 경제적 유인’ 칸으로 구성. " +
  "행동 변화 프로젝트 보고서: ‘관심 분야에서 해결하고 싶은 문제 행동 / 문제 행동이 유지되는 경제학적 원인’ 칸으로 구성.";
const SOCIAL_TABLE = {
  label: "사례 분석표",
  description: "두 사례를 분석해 표를 채운다.",
  required_items: ["해결해야 할 행동", "적용된 경제적 유인 ① 긍정/부정 ② 구체적으로", "예상되는 행동의 변화", "① 발생 가능한 문제점 ② 더 나은 경제적 유인"],
};

test("단계 이름이 표면 표로 본다", () => {
  assert.equal(labelIsTable("분석적 채점 기준표"), true);
  assert.equal(labelIsTable("사례 분석표"), true);
  assert.equal(labelIsTable("비교표"), true);
  // 낱말 끝의 '표'가 표가 아닌 것들
  assert.equal(labelIsTable("발표"), false);
  assert.equal(labelIsTable("주제 발표"), false);
  assert.equal(labelIsTable("학습 목표"), false);
  assert.equal(labelIsTable("머리기사"), false);
});

test("수학 채점 기준표 — 열은 required_items에서, 합계는 줄로", () => {
  assert.equal(isTableForm(MATH_TABLE, MATH_GUIDE), true);
  assert.deepEqual(tableColumns(MATH_TABLE, MATH_GUIDE), ["문항 번호", "평가 요소", "세부 채점 기준 및 조건", "배점"]);
  assert.equal(wantsTotalRow(MATH_TABLE, MATH_GUIDE), true);
});

test("사회 사례 분석표 — 줄 이름을 작성 기준에서 읽는다", () => {
  assert.equal(isTableForm(SOCIAL_TABLE, SOCIAL_GUIDE), true);
  assert.equal(tableColumns(SOCIAL_TABLE, SOCIAL_GUIDE).length, 4);
  assert.deepEqual(tableRowLabels(SOCIAL_TABLE, SOCIAL_GUIDE), ["사례1", "사례2"]);
});

test("같은 안내문의 산문 칸은 표가 아니다", () => {
  const prose = { label: "행동 변화 프로젝트 보고서", description: "보고서를 작성한다.", required_items: ["문제 행동", "경제학적 원인"] };
  assert.equal(isTableForm(prose, SOCIAL_GUIDE), false);
  // 수학의 다른 칸들도 표가 아니다 — 예전에는 표 요구가 네 칸 전부에 붙었다(실측 2026-11-11).
  assert.equal(isTableForm({ label: "문항 설계 및 출제 계획", description: "성취 기준과 출제 의도를 작성한다.", required_items: ["성취 기준", "출제 의도 및 핵심 아이디어"] }, MATH_GUIDE), false);
  assert.equal(isTableForm({ label: "단계별 모범 답안", description: "풀이를 작성한다." }, MATH_GUIDE), false);
  assert.equal(isTableForm({ label: "수리논술 문항", description: "[제시문 및 조건]에는 수식, 그래프 개형 스케치를 기술한다." }, MATH_GUIDE), false);
});

test("표 칸이 둘 이상이어도 각각의 열로 지시를 만든다", () => {
  const specs = tableSpecs([SOCIAL_TABLE, { label: "행동 변화 프로젝트 보고서", description: "", required_items: ["문제 행동"] }], SOCIAL_GUIDE);
  assert.equal(specs.length, 1);
  const block = tableFormBlock(specs);
  assert.match(block, /사례 분석표/);
  assert.match(block, /\| 해결해야 할 행동 \|/);
  assert.match(block, /사례1·사례2/);
  // 단계별 호출에는 자기 칸만
  assert.match(tableStepLine("사례 분석표", specs), /이 칸은 표다/);
  assert.equal(tableStepLine("행동 변화 프로젝트 보고서", specs), "");
});

test("열이 하나뿐이면 표로 만들지 않는다(소제목 한 줄짜리 칸)", () => {
  assert.deepEqual(tableSpecs([{ label: "요약표", description: "", required_items: ["내용"] }], ""), []);
});

test("작성 기준이 '표로 정리'라고만 해도 그 칸은 표다", () => {
  const el = { label: "조사 내용", description: "", required_items: ["구분", "내용", "출처"] };
  assert.equal(isTableForm(el, "조사 내용은 표로 정리한다."), true);
  assert.equal(isTableForm(el, "조사 내용은 문단으로 서술한다."), false);
});

test("분석이 표를 1차원으로 펼쳐 놓으면 되접는다 (2026-11-11 사회 실측)", () => {
  const el = {
    label: "사례 분석 표",
    description: "두 사례를 분석해 표를 채운다.",
    required_items: [
      "사례1-해결해야 할 행동", "사례1-적용된 경제적 유인", "사례1-예상되는 행동의 변화",
      "사례2-해결해야 할 행동", "사례2-적용된 경제적 유인", "사례2-예상되는 행동의 변화",
    ],
  };
  assert.deepEqual(tableColumns(el), ["해결해야 할 행동", "적용된 경제적 유인", "예상되는 행동의 변화"]);
  assert.deepEqual(tableRowLabels(el), ["사례1", "사례2"]);
});

test("줄 이름이 하나뿐이면 되접지 않는다", () => {
  const el = { label: "비교표", description: "", required_items: ["사례1-행동", "사례1-원인"] };
  assert.deepEqual(tableColumns(el), ["사례1-행동", "사례1-원인"]);
});
