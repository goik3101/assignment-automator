import { test } from "node:test";
import assert from "node:assert/strict";
import { FACTUAL_CLAIM_HINT_PATTERN, QUOTE_PATTERN, hasVerifiableClaimText } from "./verifiable-claims.ts";
import { isSceneLikeElement } from "./form-requirements.ts";

// 수정 전 판정(generate-essay.ts의 sectionHasVerifiableClaim과 같은 규칙) — "수정 전에는 이 입력이 경고 대상이었다"를 같은 테스트 안에서 보이기 위한 사본.
function oldHasVerifiableClaim(content: string): boolean {
  QUOTE_PATTERN.lastIndex = 0;
  if (/[『《][^』》]{1,60}[』》]/.test(content)) return true;
  if (QUOTE_PATTERN.test(content)) return true;
  return FACTUAL_CLAIM_HINT_PATTERN.test(content);
}

// 실제 안내문(공통국어2 매체 활용 주제발표)으로 생성한 스토리보드(2026-10-28, 출처 0개로 "검증되지 않았어요" 배너가 떴던 결과)에서 옮긴 자료.
const STORYBOARD = [
  "### 장면 1",
  "화면: 발표 시작 화면에 제목과 찬반 세트 안내가 큼직하게 보인다. 배경은 스마트폰 이미지와 교실 사진이 반반으로 나뉘어 있다.",
  '대사: "오늘 발표 주제는 \'학교에서 스마트폰 사용 규제 필요성\'입니다. 찬반을 한 세트로 비교해서 먼저 찬성 입장을 설명하겠습니다."',
  "",
  "### 장면 3",
  "화면: 스마트폰 때문에 수업 중 산만한 학생들 사진과 함께 짧은 통계 요약 자막(청소년 과의존 관련 조사 언급).",
  '대사: "조사 결과 청소년의 스마트폰 과다 사용이 학업과 건강에 영향을 준다는 연구들이 정리되어 있습니다."',
  "",
  "### 장면 8",
  "화면: 결론과 발표 마무리 화면. 발표 핵심 문장을 큰 글씨로 보여 준다.",
  '대사: "결론적으로 스마트폰 규제는 필요하지만, 학생 안전과 학습 보조 기능을 고려한 유연한 방안을 마련해야 합니다. 질문 있으시면 받겠습니다."',
].join("\n");

test("재현: 수정 전에는 스토리보드의 대사 따옴표와 '통계·조사' 낱말만으로 검증 대상이 됐다", () => {
  assert.equal(oldHasVerifiableClaim(STORYBOARD), true); // 이것이 불필요한 배너의 원인
});

test("장면 목록 단계(스토리보드)는 대사·화면 설명의 따옴표와 일반 낱말로는 검증 대상이 되지 않는다", () => {
  assert.equal(hasVerifiableClaimText(STORYBOARD, { sceneList: true }), false);
});

test("장면 목록 단계도 구체적 수치·연도·책 제목이 있으면 검증 대상이다(출처가 없으면 경고가 맞다)", () => {
  assert.equal(hasVerifiableClaimText(STORYBOARD + "\n### 장면 4\n화면: 통계 카드에 '청소년 95%가 스마트폰 보유'가 보인다.", { sceneList: true }), true);
  assert.equal(hasVerifiableClaimText("### 장면 2\n대사: 2018년 조사에서 밝혀졌습니다.", { sceneList: true }), true);
  assert.equal(hasVerifiableClaimText("### 장면 2\n화면: 『데미안』 표지가 보인다.", { sceneList: true }), true);
  assert.equal(hasVerifiableClaimText("### 장면 1(0~6초)\n화면: 2분30초 안에 끝나는 구성을 보여 준다.", { sceneList: true }), false); // 시간 표기는 사실 주장이 아니다
});

test("개요·일반 글쓰기는 기존 판정 그대로다(회귀 방지)", () => {
  for (const text of [
    "청소년의 스마트폰 과의존은 통계로 확인된다.",
    '발표에서 "청소년의 절반 가까이가 일상에 지장을 느낀다"는 문장을 인용한다.',
    "이 책 『데미안』은 성장을 다룬다.",
    "1945년에 광복을 맞았다.",
    "중국은 지침 초안을 발표했다.", // 힌트 낱말이 없는 문장
    "함께 힘내자. 응원할게.",
  ]) {
    assert.equal(hasVerifiableClaimText(text), oldHasVerifiableClaim(text), text);
  }
  assert.equal(hasVerifiableClaimText("함께 힘내자. 응원할게."), false);
});

test("순수 계획·약속 글은 검증 대상이 아니다(실행 계획 경고를 사실 주장이 있을 때만 띄우기 위한 판정)", () => {
  assert.equal(hasVerifiableClaimText("우리 모둠은 학교 앞을 안전하게 만들자고 약속했다. 발표 전에 역할을 나누고 리허설을 한다."), false);
});

test("스토리보드·카드뉴스 같은 단계는 장면 단계로 본다", () => {
  assert.equal(isSceneLikeElement({ label: "스토리보드", description: "" }), true);
  assert.equal(isSceneLikeElement({ label: "카드뉴스", description: "" }), true);
  assert.equal(isSceneLikeElement({ label: "영상 기획", description: "", required_items: ["장면 1", "장면 2"] }), true);
  assert.equal(isSceneLikeElement({ label: "개요", description: "글의 목적을 정한다" }), false);
});
