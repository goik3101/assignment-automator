import { test } from "node:test";
import assert from "node:assert/strict";
import { dataTableInstruction, findBannedVisuals, hasDataTable, needsDataTable, visualPolicy } from "./data-visual.ts";

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

test("안내문이 허용한 자료 종류를 읽고 금지된 자료를 찾는다", () => {
  const p = visualPolicy(["시각 자료는 그림·그래프·표만 사용할 수 있음.", "8개의 장면으로 작성할 것."]);
  assert.deepEqual(p.allowed.sort(), ["그래프", "그림", "표"]);
  assert.ok(p.banned.includes("사진") && p.banned.includes("영상"));
  assert.ok(!p.banned.includes("그림"));
  // 제한이 없으면 아무것도 금지하지 않는다
  assert.deepEqual(visualPolicy(["자료를 활용해 발표할 것"]), { allowed: [], banned: [] });
  // 실제 결과물에서 나온 위반 문장
  const hits = findBannedVisuals("### 장면 3\n화면 설명: 헌법재판소 건물 사진과 함께 자막이 나타난다.\n대사: 안녕하세요.", p);
  assert.equal(hits.length, 1);
  // "사진 대신 도표로"는 위반이 아니다
  assert.equal(findBannedVisuals("화면 설명: 건물 사진 대신 도표로 보여 준다.", p).length, 0);
});

test("자료 종류 제한 문장을 표 요구로 읽지 않는다(실측 2026-10-31, 국어 매체 활용 주제발표)", () => {
  const el = { label: "개요", description: "글의 목적·주제·예상 독자와 중심 내용을 쓴다." };
  const reqs = [
    "개요에는 글의 목적·주제·예상 독자를 구체적으로 설정하고, 뒷받침하는 정보를 3가지 이상 수집한다.",
    "스토리보드의 그림 자료는 그림·그래프·표만 가능하다. 제목 부분에는 명사형 키워드를 1~2개까지 기록할 수 있다.",
  ];
  const guide = "개요에는 목적·주제·예상 독자를 담는다. 그림 자료는 그림·그래프·표만 가능하며 제목에는 명사형 키워드 1~2개까지 기록할 수 있다.";
  assert.equal(needsDataTable(el, reqs, guide), false);
  assert.equal(needsDataTable({ label: "스토리보드", description: "8개 장면으로 쓴다." }, reqs, guide), false);
  // 같은 문장을 자료 제한으로는 그대로 읽는다 — 두 규칙이 어긋나지 않아야 한다.
  assert.deepEqual(visualPolicy([...reqs, guide]).allowed.sort(), ["그래프", "그림", "표"]);
  // 진짜로 표를 요구하면 여전히 참
  assert.equal(needsDataTable(el, ["개요에는 연도별 수치를 표로 정리한다."], undefined), true);
});
