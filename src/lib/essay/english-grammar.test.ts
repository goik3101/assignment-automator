import { test } from "node:test";
import assert from "node:assert/strict";
import { missingGrammarForms, requiredGrammarForms } from "./english-grammar.ts";

test("안내문에서 요구된 어법을 읽는다", () => {
  assert.deepEqual(requiredGrammarForms("수동태, It~that 강조 용법, 관계대명사를 올바르게 사용"), ["passive", "itThat", "relative"]);
  assert.deepEqual(requiredGrammarForms("영어로 120단어 이상"), []);
});

test("실측 답안: It~that 강조가 빠졌다(2026-10-22 b2)", () => {
  const text =
    "The LifeStraw is a personal water filter that was developed to provide safe drinking water. One major advantage is its portability, which allows users to drink directly from natural sources.";
  assert.deepEqual(missingGrammarForms(text, ["passive", "itThat", "relative"]), ["itThat"]);
});

test("가주어-진주어 구문은 강조 구문으로 인정하지 않는다(안내문: 혼용 시 0점)", () => {
  assert.deepEqual(missingGrammarForms("It is important that these additions stay cheap.", ["itThat"]), ["itThat"]);
  assert.deepEqual(missingGrammarForms("It is the G-Saver that reduces coal use.", ["itThat"]), []);
  assert.deepEqual(missingGrammarForms("**It was this simple filter that** saved many lives.", ["itThat"]), []);
});

test("수동태·관계대명사", () => {
  assert.deepEqual(missingGrammarForms("The device can be attached to the stove.", ["passive"]), []);
  assert.deepEqual(missingGrammarForms("The G-Saver was invented to solve poor heating.", ["passive"]), []);
  assert.deepEqual(missingGrammarForms("It collects heat, which increases heating efficiency.", ["relative"]), []);
  assert.deepEqual(missingGrammarForms("This is the place where people live.", ["relative"]), ["relative"]);
  // 관계대명사 that도 인정, 접속사 that·so that·강조 구문의 that은 아님
  assert.deepEqual(missingGrammarForms("Design approaches that can mitigate this exist.", ["relative"]), []);
  assert.deepEqual(missingGrammarForms("It uses a filter that removes bacteria.", ["relative"]), []);
  assert.deepEqual(missingGrammarForms("Studies show that the pen works. I saved money so that I could buy it.", ["relative"]), ["relative"]);
  assert.deepEqual(missingGrammarForms("It is the filter that removes bacteria.", ["relative"]), ["relative"]);
});
