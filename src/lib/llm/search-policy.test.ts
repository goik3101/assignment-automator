import { test } from "node:test";
import assert from "node:assert/strict";
import { needsFactSearch, factSearchReason } from "./search-policy.ts";

test("사실 조사가 필요한 과제는 검색을 강제한다", () => {
  assert.equal(needsFactSearch("인권 선구자의 업적 탐구", "인물 배경, 주요 활동 조사"), true);
  assert.equal(needsFactSearch("독서 감상문", "책 한 권을 골라"), true);
  assert.equal(needsFactSearch("사회문제 탐구 보고서 출처 표기"), true);
});
test("창작·계산·기획형은 검색을 강제하지 않는다", () => {
  assert.equal(needsFactSearch("신조어 만들기", "새로운 단어를 창작"), false);
  assert.equal(needsFactSearch("매주 저축액 계산", "수식과 표"), false);
  assert.equal(needsFactSearch("디지털 과의존 예방 포스터", "그림 구성"), false);
});
test("창작 표현이 있어도 조사·출처를 요구하면 검색한다 / 내용이 없으면 검색(안전한 쪽)", () => {
  assert.equal(needsFactSearch("신조어 만들기", "기존 유사 표현 조사, 출처 표기"), true);
  assert.equal(needsFactSearch(""), true);
});

test("수학·계산 중심 탐구는 '탐구'·'방법'이라는 낱말만으로 검색을 강제하지 않는다", () => {
  assert.equal(needsFactSearch("실생활 수학 탐구 보고서", "문제 설정, 변수, 계산 과정, 수식, 표, 그래프 계획, 결과, 실생활 의미", "탐구 방법을 쓰고 계산해줘"), false);
});
test("과학·사회·역사 탐구는 여전히 검색한다", () => {
  assert.equal(needsFactSearch("산업혁명이 노동자의 생활에 미친 영향 역사 탐구 보고서"), true);
  assert.equal(needsFactSearch("청소년 스마트폰 사용과 수면 문제 사회문제 탐구 보고서", "자료 조사, 출처 표기"), true);
  assert.equal(needsFactSearch("물의 온도가 설탕이 녹는 속도에 미치는 영향 실험 설계 보고서", "탐구 질문, 가설, 통제변인, 실험 방법"), true);
});

// 2026-11-14 실측(수학 수리논술 출제): 검색이 켜진 실행이 "수능 미적분 선택 비율 43.7%" 표를 지어내
// 두 칸에 붙였고 그 호출에 25.7초를 썼다. 출제형 과제는 재료가 교과 내용이라 조사할 사실이 없다.
test("학생이 문제를 내고 채점 기준을 만드는 과제는 검색을 강제하지 않는다", () => {
  assert.equal(
    needsFactSearch(
      "미적분 수리논술 문항 및 분석적 채점 기준 제작하기",
      "미적분 교과 내용 전체 중 선택",
      "문항 설계 및 출제 계획",
      "성취 기준과 출제 의도 및 핵심 아이디어를 작성한다.",
      "분석적 채점 기준표",
      "문항별 분석적 채점 기준표를 작성한다."
    ),
    false
  );
  // 같은 안내문의 다른 문구들(분석 흔들림으로 실행마다 달라지는 부분)
  assert.equal(needsFactSearch("수리논술 문항 작성하기", "단계별 모범 답안"), false);
  assert.equal(needsFactSearch("서술형 평가 문항을 직접 출제하고 채점 기준표를 만든다"), false);
  assert.equal(needsFactSearch("단원 시험지를 제작한다", "평가 요소와 배점을 정한다"), false);
});

test("출제형이어도 조사해 오라고 적혀 있으면 검색한다", () => {
  assert.equal(needsFactSearch("한국사 서술형 문항 출제하기", "역사적 사건을 조사하여 제시문을 만든다"), true);
  assert.equal(needsFactSearch("독서 문항 제작", "책 한 권을 골라 제시문으로 쓴다"), true);
  assert.equal(needsFactSearch("사회 문항 출제", "통계 자료를 인용하고 출처를 표기한다"), true);
});

test("'채점 기준표에 따라 작성'은 출제형이 아니다 — 안내문마다 있는 문구다", () => {
  assert.equal(needsFactSearch("인권 선구자 탐구 보고서", "아래 채점 기준표에 따라 작성한다"), true);
  assert.equal(needsFactSearch("사회문제 탐구", "채점 기준표를 참고하여 보고서를 작성한다"), true);
  // 주어진 문제를 푸는 과제는 출제가 아니다
  assert.equal(needsFactSearch("환경 문제를 해결하는 정책을 설계한다"), true);
});

// 2026-11-14 실측: "검색 강제=끔"만으로는 모델이 검색을 멈추지 않았다 — 도구가 붙어 있으면
// 수학 출제 과제에서도 "AP Calculus 응시자 수"를 검색해 각주 8개를 달았다. 출제형은 도구까지 뗀다.
test("출제형 과제에는 검색 도구를 붙이지 않는다", () => {
  const d = factSearchReason("미적분 수리논술 문항 및 분석적 채점 기준 제작하기", "분석적 채점 기준표를 작성한다");
  assert.equal(d.search, false);
  assert.equal(d.tool, false);
  assert.match(d.why, /출제형/);
});

test("창작·계산형은 예전처럼 강제만 끄고 도구는 남긴다", () => {
  const d = factSearchReason("매주 저축액 계산", "수식과 표");
  assert.equal(d.search, false);
  assert.equal(d.tool, true);
});

test("조사가 필요한 과제는 강제도 도구도 그대로", () => {
  const d = factSearchReason("인권 선구자의 업적 탐구", "인물 배경, 주요 활동 조사");
  assert.equal(d.search, true);
  assert.equal(d.tool, true);
  assert.match(d.why, /조사 낱말/);
});

test("SEARCH_TOOL_OFF=off면 출제형에서도 도구를 남긴다(되돌리기)", () => {
  process.env.SEARCH_TOOL_OFF = "off";
  try {
    const d = factSearchReason("미적분 수리논술 문항 및 분석적 채점 기준 제작하기");
    assert.equal(d.search, false);
    assert.equal(d.tool, true);
  } finally {
    delete process.env.SEARCH_TOOL_OFF;
  }
});
