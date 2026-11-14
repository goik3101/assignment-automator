import { test } from "node:test";
import assert from "node:assert/strict";
import { blankSelfEvaluationScores, stripCalculationCitations } from "./self-evaluation.ts";

// 2026-11-14 과학-07 실제 결과물
const SELF = `- 느낀 점과 추가 궁금증: 반복실험으로 검증하고 싶다.

자기 평가표 (각 항목을 1 / 2 / 3으로 평가)
- 양적 관계 이해: 3
- 실험 설계: 2
- 이산화탄소 질량 측정의 정확성: 2
- 역할 수행: 3

제작 참고
- 그래프는 x축에 질량을 놓는다.`;

test("자기 평가표의 점수만 비우고 항목은 남긴다(과학-07)", () => {
  const r = blankSelfEvaluationScores(SELF);
  assert.equal(r.blanked, 4);
  assert.ok(r.content.includes("- 양적 관계 이해: (      )"));
  assert.ok(!/: [23]$/m.test(r.content));
  // 평가표 밖의 줄은 그대로
  assert.ok(r.content.includes("- 느낀 점과 추가 궁금증: 반복실험으로 검증하고 싶다."));
  assert.ok(r.content.includes("- 그래프는 x축에 질량을 놓는다."));
});

test("자기 평가와 무관한 '항목: 숫자' 줄은 건드리지 않는다", () => {
  const t = "### 측정값\n- 실험1: 3\n- 실험2: 5";
  assert.equal(blankSelfEvaluationScores(t).blanked, 0);
  // 머리줄이 점수 줄 자체이면(자기평가: 3) 블록을 열지 않는다
  assert.equal(blankSelfEvaluationScores("자기평가: 3\n- 실험1: 3").blanked, 0);
});

test("계산했다고 밝힌 문장의 각주만 뗀다(수학-02 단리 이자 111만 원[7])", () => {
  const t = "단리는 원금에만 이자를 붙인다[1]. 이 조건의 단리 계산 예시는 총 납입원금 1,800만 원과 세전 이자 111만 원이다.[7] 2023년 기준금리는 3.5%였다[2].";
  const r = stripCalculationCitations(t);
  assert.equal(r.stripped, 1);
  assert.ok(r.content.includes("111만 원이다."));
  assert.ok(!r.content.includes("[7]"));
  assert.ok(r.content.includes("[1]") && r.content.includes("[2]"));
});

test("통계를 인용한 문장·소제목·표 줄은 건드리지 않는다", () => {
  const t = "### 계산 결과 12%[3]\n| 계산 결과 12% [3] |\n노인 빈곤율은 2023년 38.2%로 집계됐다.[4]";
  assert.equal(stripCalculationCitations(t).stripped, 0);
});
