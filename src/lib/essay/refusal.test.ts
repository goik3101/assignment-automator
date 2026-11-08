import { test } from "node:test";
import assert from "node:assert/strict";
import { findRefusalSentences, refusalRepairText } from "./refusal.ts";

test("제출 글에 섞인 거절문을 찾는다(실측 2026-10-31, 사회 평가지)", () => {
  const real = [
    "신문 기사 원문이나 기사 링크가 제공되지 않아 제목·날짜·신문사와 기사 내용을 확인할 수 없다.",
    "확인되지 않은 기사 제목이나 출처를 만들어 스크랩처럼 제시하지는 않겠다.",
    "현재 주어진 자료에는 2026년 1월 보건복지부 보도자료의 내용만 있어, 신문 기사 스크랩 요건을 충족하지 않는다.",
  ].join("\n");
  assert.equal(findRefusalSentences(real).length, 3);
  assert.match(refusalRepairText(findRefusalSentences(real), "신문 기사 스크랩"), /거절하지 말고/);
});

test("보통 문장은 거절로 보지 않는다", () => {
  const ok = [
    "2026년 기초연금 선정기준액은 단독가구 월 247만 원으로 정해졌다.[2]",
    "이 자료만으로는 지역별 차이를 비교하기 어렵지만, 전국 평균은 확인할 수 있다.",
    "기사 제목과 날짜는 [직접 작성: 스크랩한 기사의 제목·날짜]에 적는다.",
    "노인 빈곤 문제는 소득 격차와 함께 살펴봐야 한다.",
  ].join("\n");
  assert.deepEqual(findRefusalSentences(ok), []);
});

test("각주가 달린 사실 서술은 거절문이 아니다", () => {
  assert.deepEqual(findRefusalSentences("유튜브는 2009년 한국에서 인터넷 실명제를 별도로 도입하지 않겠다고 밝혔다.[5]"), []);
  assert.deepEqual(findRefusalSentences("유선 케이블에는 마이크가 포함되지 않아 통화용 마이크를 쓸 수 없다.[3]"), []);
});

test("각주 없는 진짜 거절문은 그대로 잡는다", () => {
  const t = "신문 기사 원문이 제공되지 않아 기사 내용을 확인할 수 없다. 확인되지 않은 출처를 만들어 제시하지는 않겠다.";
  assert.ok(findRefusalSentences(t).length >= 1);
});

test("제3자의 말과 글쓰기 계획은 거절문이 아니다", () => {
  assert.deepEqual(findRefusalSentences("유튜브가 한국식 실명제를 도입하지 않겠다고 밝힌 뒤 이용자가 옮겨 갔다."), []);
  assert.deepEqual(findRefusalSentences("한쪽 주장만 나열하지 않으려 한다."), []);
});

test("지어내기를 거부하는 말은 그대로 잡는다", () => {
  assert.ok(findRefusalSentences("확인되지 않은 기사 제목을 지어내지 않겠다.").length >= 1);
});

test("자료 낱말과 '없다' 사이에 다른 말이 끼어도 거절문으로 잡는다 (사회 평가지 스크랩 칸 실측)", () => {
  assert.deepEqual(
    findRefusalSentences("현재 원고에 기사 원문과 제목·날짜·출처가 없어 원문 그대로 기재할 수 없다."),
    ["현재 원고에 기사 원문과 제목·날짜·출처가 없어 원문 그대로 기재할 수 없다."]
  );
  assert.equal(findRefusalSentences("자료가 충분하지 않아 표를 채울 수 없다.").length, 0); // 짝이 없으면(자료 낱말+없다 꼴이 아니면) 안 잡는다
  assert.equal(findRefusalSentences("기사 본문이 없으므로 제목을 기입할 수 없다.").length, 1);
});

test("넓힌 뒤에도 사실 서술은 그대로 둔다 (전수 감사에서 걸렸던 거짓 4건)", () => {
  assert.equal(findRefusalSentences("유튜브는 2009년 한국에서 인터넷 실명제를 별도로 도입하지 않겠다고 밝혔다.[5]").length, 0);
  assert.equal(findRefusalSentences("유선 케이블에는 내장 마이크가 포함되지 않아 통화용 마이크를 쓸 수 없다.[3]").length, 0);
  assert.equal(findRefusalSentences("기초연금은 소득 하위 70%에게만 지급되어 상위 30%는 받을 자격이 없다.[2]").length, 0);
  // 각주가 없어도, "못 하겠다"는 짝이 없으면 그대로 둔다
  assert.equal(findRefusalSentences("조사 과정에서 1945년 이전 통계는 자료가 없어 다루지 못한 한계가 있다.").length, 0);
});

test("학생에게 말을 거는 문장은 그 자체로 거절문으로 본다 (제출 글에 있을 수 없다)", () => {
  assert.equal(findRefusalSentences("기사 링크나 원문을 보내 주시면 제목·날짜·출처를 포함해 정리해 드릴 수 있습니다.").length, 1);
  assert.equal(findRefusalSentences("이데일리 기사 원문이 제공되지 않아 기사 본문을 붙일 수 없습니다.").length, 1);
  assert.equal(findRefusalSentences("자료를 알려 주시면 표로 정리해 드리겠습니다.").length, 1);
  // 글 속의 평범한 서술은 건드리지 않는다
  assert.equal(findRefusalSentences("정부는 기초연금을 소득 하위 70%에게 지급한다.").length, 0);
  assert.equal(findRefusalSentences("학생은 선정한 기사를 출력해 붙인다.").length, 0);
});
