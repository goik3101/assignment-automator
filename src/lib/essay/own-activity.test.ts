import { test } from "node:test";
import assert from "node:assert/strict";
import { countBlanks, findOwnActivitySentences, isOwnActivitySentence, isOwnRecordStep } from "./own-activity.ts";

// 실제 제출 직전 결과물(2026-10-29)에서 그대로 가져온 문장들 — 학생이 하지 않은 행동을 썼다고 한 경우.
const FABRICATED = [
  "오늘 수업 시간 중 스마트폰으로 정부 통계 요약 페이지와 보도자료, 관련 통계표 화면을 촬영했다.",
  "국제 비교 자료로 OECD의 2020년 기준 노인 소득 빈곤율 통계를 캡처해 보관했다.",
  "보건복지부가 2024년 기초연금 선정기준액을 상향한 발표를 확인했고, 해당 화면을 촬영했다.",
  "기사 제목과 날짜가 보이게 출력했다.",
];
// 사실 서술 — 주어가 기관이거나 학생 행동이 아니다.
const FACTUAL = [
  "헌법재판소는 2012년 8월 23일 본인확인제가 표현의 자유를 침해한다고 결정했다.",
  "통계청은 65세 이상 노인의 상대적 빈곤율을 해마다 집계해 발표한다.",
  "연구진이 설문조사를 실시했다.",
  "노인 빈곤율은 2011년 57.0%에서 2023년 55.5%로 낮아졌다.",
];

test("학생이 하지 않은 행동을 쓴 문장만 가려낸다", () => {
  for (const s of FABRICATED) assert.equal(isOwnActivitySentence(s), true, s);
  for (const s of FACTUAL) assert.equal(isOwnActivitySentence(s), false, s);
});

test("소제목·표 줄은 보지 않고, 불릿 문장은 본다", () => {
  const content = `### 수집 방법\n| 촬영했다 |\n- 스마트폰으로 통계표 화면을 촬영했다.\n헌법재판소는 위헌으로 결정했다.`;
  const hits = findOwnActivitySentences(content);
  assert.equal(hits.length, 1);
  assert.match(hits[0], /스마트폰으로/);
});

test("직접 수행 기록 단계를 가려내고 빈칸을 센다", () => {
  assert.equal(isOwnRecordStep({ label: "자료 수집 및 기록", description: "자료를 조사해 기록한다." }), true);
  assert.equal(isOwnRecordStep({ label: "청중 기록지", description: "" }), true);
  assert.equal(isOwnRecordStep({ label: "정책 제안서", description: "해결 방안을 제안한다." }), false);
  // 실제 결과물(결과물.2.txt)의 빈칸 표기
  const t = "날짜: [직접 작성: 조사한 날짜]\n[직접 작성: 관할 시·군·구 이름]의 경보 빈도\n고농도 일수 [직접 작성: 캡처한 일수]일";
  assert.equal(countBlanks(t), 3);
  assert.equal(countBlanks("빈칸 없는 글"), 0);
});
