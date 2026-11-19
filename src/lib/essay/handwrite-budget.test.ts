import { test } from "node:test";
import assert from "node:assert/strict";
import { handwriteBudget, clampToHandwrite, stepHandwriteBudget } from "./handwrite-budget.ts";

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

test("손글씨·수행평가 시간·디지털 기기 불가 같은 말도 '그 자리에서 손으로 쓰는 평가'로 읽는다 (2026-11-15 역사 신문)", () => {
  assert.ok(handwriteBudget(["5반 손글씨 안내: B4용지, 분량제한 X."]));
  assert.ok(handwriteBudget(["미리 준비하지 못한 경우 수행평가 시간을 할애하여 그리면 인정함."]));
  assert.ok(handwriteBudget(["교과서, 학습지를 활용할 수 있으나 디지털 기기는 지참 및 사용 불가."]));
  assert.equal(handwriteBudget(["집에서 보고서를 작성해 파일로 제출한다.", "분량은 A4 2장 이내"]), null);
});

// 2026-11-19 사용자 개선 요청(공통국어 책 처방전): 차시마다 쓰는 시간이 다르고, "시험 대형" 같은 신호가 한 낱말도 없는 안내문이다.
const BOOK_RX = `공통국어 2학기 수행평가

1차시 고민쓰기
활동 내용 : 요즘 나의 고민 등을 씀.
활동 시간 : 9/3 전후 국어시간에 약 25분 가량
기타 : 줄 쳐진 A4 용지 제공

2차시 고민뽑기 및 친구의 고민 분석하기 [도서관 수업]
활동 내용 : 친구의 문제상황을 요약한 후 그 원인을 분석하고 해결책을 제안함.
활동 시간 : 9/9 전후 국어시간(제비뽑기10분, 25분 쓰고, 나머지 시간 책 돌려보기)

3차시 책 처방전 쓰기
활동 내용 : 도움을 줄 수 있는 책을 소개함.
활동 시간 : 9/15전후 한 시간 동안 진행함.

4차시 친구에게 편지 쓰기
활동 내용 : 친구에게 마음을 전하는 손편지 직접 쓰기.
활동 시간 : 3차시 바로 다음 시간에 30분간 진행함.`;

test("차시마다 그 차시의 쓰는 시간을 읽는다(첫 숫자를 모든 단계에 쓰지 않는다)", () => {
  assert.equal(stepHandwriteBudget({ label: "고민 쓰기" }, BOOK_RX)?.minutes, 25);
  assert.equal(stepHandwriteBudget({ label: "친구의 고민 분석 및 해결책 제안" }, BOOK_RX)?.minutes, 25); // 제비뽑기 10분이 아니라 쓰는 25분
  assert.equal(stepHandwriteBudget({ label: "책 처방전" }, BOOK_RX)?.minutes, 60);
  const letter = stepHandwriteBudget({ label: "친구에게 편지 쓰기" }, BOOK_RX);
  assert.equal(letter?.minutes, 30);
  assert.equal(letter?.chars, 900);
});

test("발표·말하기 차시의 시간은 쓰는 시간이 아니다", () => {
  const speech = `1차시 주제 정하기
활동 내용 : 주제를 정해 적음.
활동 시간 : 25분

2차시 발표하기
활동 내용 : 모둠별로 발표함.
활동 시간 : 20분`;
  assert.equal(stepHandwriteBudget({ label: "발표하기" }, speech), null);
  assert.equal(stepHandwriteBudget({ label: "주제 정하기" }, speech)?.minutes, 25);
});

test("차시 구역이 없는 안내문이나 시간이 없는 구역은 null(예전 관문이 맡는다)", () => {
  assert.equal(stepHandwriteBudget({ label: "보고서" }, "활동 시간 : 40분"), null);
  assert.equal(stepHandwriteBudget({ label: "A" }, "1차시 A\n활동 내용 : 씀\n\n2차시 B\n활동 내용 : 씀"), null);
});

test("'제비뽑기 10분, 25분 쓰고'에서 쓰는 시간은 25분이다(사이에 다른 숫자가 끼면 그 앞 숫자는 쓰는 시간이 아니다)", () => {
  assert.equal(handwriteBudget(["활동 시간 : 국어시간(제비뽑기10분, 25분 쓰고, 나머지 시간 책 둘러보기)"])?.minutes, 25);
});
