import { test } from "node:test";
import assert from "node:assert/strict";
import { handwriteBudget, clampToHandwrite } from "./handwrite-budget.ts";

test("교실에서 손으로 쓰는 평가면 한 차시를 기준으로 잡는다 (2026-11-12 과학)", () => {
  // 과학(멸치) 안내문의 실제 문장
  const b = handwriteBudget(["2차시는 먹이관계와 생태계 피라미드에 대한 개별 평가", "미리 시험 대형으로 책상 간격을 띄우기"]);
  assert.ok(b);
  assert.equal(b.minutes, 45);
  assert.equal(b.chars, 1350); // 만점 실측 1,307~1,501자와 같은 구간
});

test("안내문이 분을 못 박으면 그 숫자를 쓴다 (사회 인권저널)", () => {
  const b = handwriteBudget(["시험 대형으로 배치, 번호순으로 착석", "평가 시간: 시작부터 40분 부여함"]);
  assert.equal(b?.minutes, 40);
  assert.equal(b?.chars, 1200);
});

test("'1시간'도 읽는다 (화작)", () => {
  const b = handwriteBudget(["휴대폰 사용 불가(시작 전에 휴대폰 걷고 시작함.)", "실시일 : 8월 25일 ~ 8월 28일 중 1시간"]);
  assert.equal(b?.minutes, 60);
  assert.equal(b?.chars, 1800);
});

test("발표 시간을 쓰는 시간으로 읽지 않는다 (국어 발표)", () => {
  // 그 자리에서 손으로 쓴다는 신호가 없다 — 애초에 발동하지 않아야 한다.
  assert.equal(handwriteBudget(["시간: 2분30초~3분만 인정", "순서는 제비뽑기로 정하며"]), null);
  // 신호가 있어도 10분 미만은 버린다.
  const b = handwriteBudget(["시험 대형으로 앉는다", "발표는 3분 이내"]);
  assert.equal(b?.minutes, 45, "3분을 쓰는 시간으로 읽으면 안 된다");
});

test("집에서 쓰는 과제는 건드리지 않는다", () => {
  assert.equal(handwriteBudget(["조사한 내용을 바탕으로 보고서를 작성한다."]), null);
  assert.equal(handwriteBudget([undefined, ""]), null);
});

test("역할 범위를 좁히기만 하고 넓히지 않는다", () => {
  const budget = handwriteBudget(["시험 대형", "개별 평가"]);
  // 보고서 역할(960~1,800) → 1,350으로 좁힌다
  const narrowed = clampToHandwrite({ min: 960, max: 1800 }, budget);
  assert.equal(narrowed.max, 1350);
  assert.equal(narrowed.min, 960);
  assert.equal(narrowed.clamped, true);
  // 이미 짧은 칸은 그대로
  const small = clampToHandwrite({ min: 200, max: 500 }, budget);
  assert.deepEqual(small, { min: 200, max: 500, clamped: false });
  // 바닥이 천장을 넘으면 바닥도 내린다(범위가 뒤집히면 프롬프트가 모순을 말한다)
  const deep = clampToHandwrite({ min: 2000, max: 2800 }, budget);
  assert.ok(deep.min <= deep.max);
  // 예산이 없으면 아무것도 바꾸지 않는다
  assert.deepEqual(clampToHandwrite({ min: 960, max: 1800 }, null), { min: 960, max: 1800, clamped: false });
});
