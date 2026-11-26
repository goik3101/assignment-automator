import { test } from "node:test";
import assert from "node:assert/strict";
import { recentConstraint, wantsRecent } from "./recency.ts";

test("최신·트렌드를 요구할 때만 건다(정보-01·과학-01), 허용 문장·'요즘 나의 고민'은 걸지 않는다", () => {
  assert.equal(wantsRecent(["우리 곁의 IT 트렌드 발견 및 사회적 영향 탐구 보고서 작성하기"]), true);
  assert.equal(wantsRecent(["최신 과학기술 사례 분석을 통한 미래 사회 전망 연구"]), true);
  assert.equal(wantsRecent(["예시 외의 다른 주제를 선정할 수 있으며, 노벨의학상 등을 검색해 최신 연구를 주제로 삼아도 된다."]), false);
  assert.equal(wantsRecent(["요즘 나의 고민, 해결하고 싶은 문제를 구체적으로 씀."]), false);
  assert.equal(wantsRecent(["인권 선구자의 업적을 탐구한다.", undefined]), false);
  process.env.SELECTION_RECENCY = "off";
  try {
    assert.equal(wantsRecent(["IT 트렌드"]), false);
  } finally {
    delete process.env.SELECTION_RECENCY;
  }
});

test("조건 문구에 기준 연도가 들어간다", () => {
  assert.match(recentConstraint(2026), /2026년 기준 최근 3년 안\(2024~2026년\)/);
});
