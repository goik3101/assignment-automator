import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptKoreanRewrite, flippedToEnglish, koreanLanguageIssue } from "./korean-guard.ts";

const ENGLISH_SCRIPT =
  "Title: Opposing the Real-Name System Online\n\nHello everyone. Today I will explain why I oppose the real-name system for online posts and comments and suggest better ways to handle online harms. First, freedom of expression: identity verification can shrink free expression and cause self-censorship.";
const STORYBOARD =
  '### 장면 1\n슬라이드 화면: 제목 슬라이드 — "Opposing Internet Real-Name Policy"와 부제 "For high school students" 텍스트. 시각 이미지: 교실 사진.\n### 장면 2\n슬라이드 화면: 문제 제기 — "What is the Internet Real-Name Policy?" 텍스트와 정의 박스. 내용 설명: 인터넷 실명제가 무엇인지 보여 준다[3].';
const KOREAN =
  "헌법재판소는 2012년 8월 23일에 인터넷 실명제 조항을 위헌이라고 결정했다[1]. 이 결정은 표현의 자유를 지키는 쪽으로 무게를 둔 것이다. 유엔(UN)과 OECD 자료도 함께 살펴보았다.";

test("한국어로 써야 하는 글이 영어로 나오면 잡는다", () => {
  assert.ok(koreanLanguageIssue(ENGLISH_SCRIPT));
  // 문장 대부분은 한국어여도 영어 제목·문구가 세 번 이상 섞이면 잡는다(스토리보드 실측).
  assert.ok(koreanLanguageIssue(STORYBOARD));
  assert.equal(koreanLanguageIssue(KOREAN), null);
});

test("출처 줄의 영문 기사 제목·주소는 판정에서 뺀다", () => {
  const withSources = `${KOREAN}\n\n### 출처\n- The Real-Name Verification System and Its Effects on Korean Online Communities: https://example.org/a\n- Another Long English Paper Title About Free Speech: https://example.org/b\n- One More English Title For The Source List: https://example.org/c`;
  assert.equal(koreanLanguageIssue(withSources), null);
});

test("한국어 → 영어로 바뀐 분량 보정은 막는다", () => {
  assert.equal(flippedToEnglish(KOREAN, ENGLISH_SCRIPT), true);
  assert.equal(flippedToEnglish(KOREAN, KOREAN), false);
  assert.equal(flippedToEnglish(ENGLISH_SCRIPT, ENGLISH_SCRIPT), false);
});

test("한국어 재작성: 각주가 그대로이고 영어가 남지 않아야 받는다", () => {
  assert.equal(acceptKoreanRewrite(STORYBOARD, "### 장면 1\n슬라이드 화면: 제목 '인터넷 실명제 반대'. 내용 설명: 실명제가 무엇인지 보여 준다[3]."), true);
  assert.equal(acceptKoreanRewrite(STORYBOARD, "### 장면 1\n내용 설명: 실명제가 무엇인지 보여 준다."), false);
  assert.equal(acceptKoreanRewrite(STORYBOARD, STORYBOARD), false);
});
