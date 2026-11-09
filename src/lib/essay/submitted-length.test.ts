import { test } from "node:test";
import assert from "node:assert/strict";
import { submittedLength, submittedText } from "./submitted-length.ts";

test("마크다운 표기와 각주 번호는 세지 않고, 글자는 센다", () => {
  const sec = `### 남한에 대한민국 정부 수립
**이승만, 1948년 8월 15일 기념사에서 새 정부 출범을 선포**

1948년 8월 15일 대한민국 정부가 수립됐다.[1] 국내 언론은 승인 사실을 전했다.[2,3]`;
  const t = submittedText(sec);
  assert.ok(!t.includes("#"), "소제목 표시가 남았다");
  assert.ok(!t.includes("**"), "굵게 표시가 남았다");
  assert.ok(!t.includes("[1]") && !t.includes("[2,3]"), "각주 번호가 남았다");
  assert.ok(t.includes("남한에 대한민국 정부 수립"), "소제목 글자가 사라졌다");
  assert.ok(t.includes("이승만"), "굵게 안의 글자가 사라졌다");
  // 같은 글을 예전 방식(content.trim().length)으로 세면 마크다운까지 들어가 더 길다
  assert.ok(submittedLength(sec) < sec.trim().length);
});

test("공백을 세는지 여부를 고를 수 있다", () => {
  const sec = "가 나 다";
  assert.equal(submittedLength(sec, true), 5);
  assert.equal(submittedLength(sec, false), 3);
});

test("표 줄은 칸에 옮겨 적는 모양이 아니라 세지 않는다", () => {
  const sec = "온도 변화를 정리했다.\n| 구분 | 값 |\n|---|---|\n| 처음 | 20도 |";
  assert.equal(submittedText(sec), "온도 변화를 정리했다.");
});

test("목록 표시는 떼고 항목 글자는 센다", () => {
  assert.equal(submittedText("- 첫째 근거\n1) 둘째 근거"), "첫째 근거\n둘째 근거");
});

test("밑줄 태그와 링크 문법에서 보이는 글자만 남긴다", () => {
  assert.equal(submittedText("<u>It is</u> that"), "It is that");
  assert.equal(submittedText("자료는 [국가기록원](https://example.go.kr)에 있다."), "자료는 국가기록원에 있다.");
});

test("빈 글은 0이다", () => {
  assert.equal(submittedLength(""), 0);
  assert.equal(submittedLength("\n\n"), 0);
});
