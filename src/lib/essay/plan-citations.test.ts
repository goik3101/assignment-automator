import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlanSentence, stripPlanCitations } from "./plan-citations.ts";

// 아래 문장은 모두 실제 생성 결과(2026-10-29 측정 20회)에서 그대로 가져왔다.
const PLAN = [
  "먼저 헌법재판소의 위헌 결정과 그 이유를 근거로 실명제 도입의 법적 문제를 설명한다",
  "본론 둘째 부분에서는 실효성 판단 근거를 제시하며 실제로 댓글·명예훼손 감소 효과가 확인되지 않았음을 설명한다",
  "끝으로 대안적 해결책으로 기존 법적 조치와 플랫폼 자율규제, 교육적 접근을 설명한다",
  "따라서 전문 용어는 쉽게 설명하고, 판결 근거와 현실 사례를 연결해 이해를 돕는 방식으로 쓸 것이다",
  // "연구 결과로"처럼 수단으로 쓴 말은 주어가 글쓴이이므로 계획 문장이다.
  "마지막으로 실명제가 역효과를 낳을 수 있음을 국내외 사례와 연구 결과로 보여 준다",
];
// 사실 서술 — 계획 동사로 끝나거나 비슷해 보여도 각주를 떼면 안 된다.
const FACTUAL = [
  "관련 기관 자료는 본인확인 후 닉네임 사용을 허용하는 방식이 익명성을 일부 보장한다고 정리한다",
  "반대의견은 실명제가 이용자의 자유로운 의견 표명을 제한할 수 있다는 점을 문제삼는다",
  "대체 방안으로는 익명성 남용에 대응하는 기존의 형사·민사 제도와 플랫폼의 자율적 관리 강화, 교육적 접근을 제안한다",
  "먼저 2012년 헌법재판소의 위헌 결정을 설명한다",
  // 주어가 출처 쪽이면 계획이 아니라 사실 서술이다 — 20회 전수 확인에서 나온 유일한 오탐.
  "마지막으로 도입 경험과 연구는 실명제가 비방·욕설을 일부 줄였지만 참여 자체를 크게 축소하는 부작용을 낳았음을 보여 준다",
];

test("계획·작업 서술 문장만 가려낸다", () => {
  for (const s of PLAN) assert.equal(isPlanSentence(s), true, s);
  for (const s of FACTUAL) assert.equal(isPlanSentence(s), false, s);
});

test("각주 표시만 떼고 문장은 그대로 둔다", () => {
  const before = `먼저 헌법재판소의 위헌 결정을 근거로 법적 문제를 설명한다[1]. 헌법재판소는 이 제도가 표현의 자유를 침해한다고 판단했다[2].`;
  const r = stripPlanCitations(before);
  assert.equal(r.stripped, 1);
  assert.match(r.content, /법적 문제를 설명한다\. /);
  assert.match(r.content, /침해한다고 판단했다\[2\]\./);
});

test("연도·수치·따옴표가 있으면 건드리지 않는다", () => {
  const t = `먼저 2012년 헌법재판소의 위헌 결정을 설명한다[1].`;
  assert.equal(stripPlanCitations(t).stripped, 0);
  const q = `먼저 "표현의 자유를 침해한다"는 판단을 제시한다[2].`;
  assert.equal(stripPlanCitations(q).stripped, 0);
});

test("소제목·표 줄과 각주 없는 글은 그대로 둔다", () => {
  const t = `### 먼저 설명한다\n| 먼저 설명한다[1] |\n먼저 설명한다`;
  const r = stripPlanCitations(t);
  assert.equal(r.stripped, 0);
  assert.equal(r.content, t);
});

test("여러 개가 붙은 각주도 한 번에 뗀다", () => {
  const r = stripPlanCitations(`마지막으로 대안을 제시한다[1][3].`);
  assert.equal(r.stripped, 2);
  assert.equal(r.content, `마지막으로 대안을 제시한다.`);
});
