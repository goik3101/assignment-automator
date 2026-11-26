import { test } from "node:test";
import assert from "node:assert/strict";
import { assignWorks, distinctWorkCount, distinctWorkLine, workSteps, workTitles } from "./distinct-works.ts";

const LABELS = ["수행평가 1차시 활동지", "수행평가 2차시 활동지", "수행평가 3차시 활동지", "수행평가 종합 활동지"];

test("'작품 3개를 골라 각각'만 읽는다(국어-02). 다른 '각각 N개'·선정 문장은 걸리지 않는다", () => {
  assert.equal(distinctWorkCount(["활동지는 1~3차시 활동으로 구성되며, 선정한 시집에서 작품 3개를 골라 각각 수행한다."]), 3);
  assert.equal(distinctWorkCount(["시 두 편을 선택하여 각각 감상문을 쓴다."]), 2);
  assert.equal(distinctWorkCount(["문제 해결을 위해 정부, 시민단체, 기업, 개인이 할 수 있는 노력을 각각 2개씩 정리한다."]), 0);
  assert.equal(distinctWorkCount(["한 학기 한 권 읽기 활동에서 시집을 선택하여 읽고 활동을 수행한다."]), 0);
  process.env.DISTINCT_WORKS = "off";
  try {
    assert.equal(distinctWorkCount(["작품 3개를 골라 각각 수행한다."]), 0);
  } finally {
    delete process.env.DISTINCT_WORKS;
  }
});

test("작품은 차시 순서대로 맡고 종합 단계는 맡지 않는다", () => {
  assert.deepEqual(workSteps(LABELS, 3), LABELS.slice(0, 3));
  assert.deepEqual(workSteps([LABELS[2], LABELS[0], LABELS[1]], 3), LABELS.slice(0, 3));
  assert.deepEqual(workSteps(["활동지 A", "활동지 B"], 2), []); // 차시 이름이 없으면 배정하지 않는다
  assert.deepEqual(workSteps(LABELS.slice(0, 2), 3), []);
});

test("작품 제목은 「」에서 순서대로, 시집 제목(『』《》)은 뺀다", () => {
  const facts = ["이병률의 《바다는 잘 있습니다》는 2017년 시집이다.", "목차에는 「이별의 원심력」, 「있지」, 「내시경」이 포함된다.", "「이별의 원심력」에서 제목을 가져왔다."];
  assert.deepEqual(workTitles(facts), ["이별의 원심력", "있지", "내시경"]);
});

test("배정: 학생이 적은 작품이 먼저, 모자라면 조사 사실로 채우고, 3개를 못 구하면 아무것도 안 한다", () => {
  const facts = ["「이별의 원심력」, 「있지」, 「내시경」"];
  const a = assignWorks(LABELS, 3, [], facts);
  assert.equal(a.get(LABELS[0]), "이별의 원심력");
  assert.equal(a.get(LABELS[2]), "내시경");
  assert.equal(a.has(LABELS[3]), false);
  const b = assignWorks(LABELS, 3, ["나는 「섬」을 먼저 읽을래"], facts);
  assert.equal(b.get(LABELS[0]), "섬");
  assert.equal(b.get(LABELS[1]), "이별의 원심력");
  assert.equal(assignWorks(LABELS, 3, [], ["「이별의 원심력」만 나온다"]).size, 0);
});

test("단계마다 붙는 한 줄: 맡은 작품 하나와 다른 차시 작품을 말한다", () => {
  const a = assignWorks(LABELS, 3, [], ["「A시」「B시」「C시」"]);
  const line = distinctWorkLine(LABELS[1], a);
  assert.match(line, /「B시」 하나/);
  assert.match(line, /「A시」·「C시」/);
  assert.equal(distinctWorkLine(LABELS[3], a), "");
});

test("같은 사진을 분석해도 단계 이름이 달라진다 — '활동지 1차시'·'감상활동지(1)'도 차시 순서로 읽고 총평은 뺀다", () => {
  assert.deepEqual(workSteps(["활동지 1차시", "활동지 2차시", "활동지 3차시", "총평 활동지"], 3), ["활동지 1차시", "활동지 2차시", "활동지 3차시"]);
  assert.deepEqual(workSteps(["감상활동지(1)", "감상활동지(2)", "감상활동지(3)", "총평활동지"], 3), ["감상활동지(1)", "감상활동지(2)", "감상활동지(3)"]);
});
