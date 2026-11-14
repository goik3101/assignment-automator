import test from "node:test";
import assert from "node:assert/strict";
import { stripPromptLeaks } from "./prompt-leak.ts";

test("겹낫표와 괄호 저자 표기를 지운다(사회-06)", () => {
  const r = stripPromptLeaks("리처드 탈러와 캐스 선스타인이 공동으로 쓴 『『넛지』』 (저자: 캐스 선스타인)는 선택 환경을 다룬다.");
  assert.equal(r.content, "리처드 탈러와 캐스 선스타인이 공동으로 쓴 『넛지』는 선택 환경을 다룬다.");
  assert.equal(r.fixed, 2);
});

test("정상 표기와 칸 이름표는 그대로 둔다", () => {
  const t = "책 제목: 『넛지』\n저자: 리처드 탈러\n『넛지』는 좋은 책이다.";
  const r = stripPromptLeaks(t);
  assert.equal(r.content, t);
  assert.equal(r.fixed, 0);
});
