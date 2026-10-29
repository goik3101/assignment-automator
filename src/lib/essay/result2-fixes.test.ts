// 실제 제출 결과물(결과물.2.txt, 2026-10-30)에서 발견된 네 가지를 그 문장 그대로 고정한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { stripHeadingDirectives, stripMetaNoteLines, tabTableToMarkdown } from "./deliverable.ts";
import { isLandingPage } from "./research-notes.ts";
import { tidyOutputText } from "../gemini/citations.ts";

test("소제목에 베껴 붙은 작성 지시를 뗀다", () => {
  const r = stripHeadingDirectives("### 해결 방안 (제출용 글 — 항목마다 문단)\n본문");
  assert.equal(r.removed, 1);
  assert.match(r.content, /^### 해결 방안$/m);
  // 안내문 항목 이름의 괄호는 그대로 둔다
  assert.equal(stripHeadingDirectives("### 국내 또는 해외에 미치는 영향(2가지)").removed, 0);
  assert.equal(stripHeadingDirectives("해결 방안 (제출용 글 — 항목마다 문단)").removed, 0); // 소제목 줄이 아니면 건드리지 않는다
});

test("머리말만 괄호인 작업 설명 줄도 지운다", () => {
  const line = "(근거 표시) 위의 연도별 수치와 국가 수준의 농도 변화는 환경부·에어코리아의 연간 자료에서 확인한 값이다[1].";
  assert.equal(stripMetaNoteLines(line).removed, 1);
  // 본문 문장은 건드리지 않는다
  assert.equal(stripMetaNoteLines("(사진) 설명을 덧붙인다.").removed, 0);
});

test("탭으로 줄 맞춘 표를 마크다운 표로 바꾼다", () => {
  const t = "연도\t값 (㎍/㎥)\n2015\t26\n2017\t25\n2020\t19\n\n다음 문장";
  const r = tabTableToMarkdown(t);
  assert.equal(r.converted, 1);
  assert.match(r.content, /\| 연도 \| 값 \(㎍\/㎥\) \|/);
  assert.match(r.content, /\| --- \| --- \|/);
  assert.match(r.content, /\| 2020 \| 19 \|/);
  assert.equal(tabTableToMarkdown("그냥 문장이다.\n또 한 줄.").converted, 0);
});

test("기관 첫 화면 주소는 근거로 보지 않는다", () => {
  for (const u of ["https://www.me.go.kr/", "https://www.air.go.kr/main.do", "https://example.go.kr", "https://x.kr/index.jsp"]) {
    assert.equal(isLandingPage(u), true, u);
  }
  for (const u of ["https://www.me.go.kr/home/web/board/read.do?menuId=10525&boardId=1631", "https://index.go.kr/unity/potal/indicator/IndexInfo.do?idxCd=5057", "https://www.yna.co.kr/view/AKR20250131056800530"]) {
    assert.equal(isLandingPage(u), false, u);
  }
});

test("각주 뒤에 남은 쉼표를 정리한다", () => {
  assert.equal(tidyOutputText("…확인한 값이다[1],."), "…확인한 값이다[1].");
});
