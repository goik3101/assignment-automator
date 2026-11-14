import test from "node:test";
import assert from "node:assert/strict";
import { stripAdminLeak } from "./admin-leak.ts";

test("배점 문구가 줄머리 라벨로 묻어 나오면 라벨만 뗀다(사회-04)", () => {
  const r = stripAdminLeak("내용을 충실하게 작성하면 9점: 주제 선정 이유와 탐구 질문, 조사 계획, 내용 구성을 구체적으로 담았다.");
  assert.equal(r.content, "주제 선정 이유와 탐구 질문, 조사 계획, 내용 구성을 구체적으로 담았다.");
  assert.equal(r.removed.length, 1);
});

test("채점 기준을 만드는 칸에서는 그대로 둔다", () => {
  const t = "내용을 충실하게 작성하면 9점: 주제 선정 이유와 탐구 질문, 조사 계획을 구체적으로 담았다.";
  assert.equal(stripAdminLeak(t, { keepScoring: true }).content, t);
});

test("본문 속 숫자나 점수가 아닌 라벨은 건드리지 않는다", () => {
  const t = "결과: 실험에서 pH가 7에서 3으로 내려갔고 지시약의 색이 노란색으로 변했다.\n단리의 이자는 9점이 아니라 원금의 일정 비율이다.";
  assert.equal(stripAdminLeak(t).content, t);
});
