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
