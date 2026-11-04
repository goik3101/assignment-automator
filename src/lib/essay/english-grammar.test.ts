import { test } from "node:test";
import assert from "node:assert/strict";
import type { GrammarForm } from "./english-grammar.ts";
import { missingGrammarForms, requiredGrammarForms, wantsUnderline, stripUnderlineTags, missingUnderlinedForms, underlineGrammarForms, forbidsRelativeAdverb, relativeAdverbInUnderline } from "./english-grammar.ts";

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
});

test("밑줄 요구 여부", () => {
  assert.ok(wantsUnderline("해당 표현에 밑줄을 그을 것"));
  assert.ok(!wantsUnderline("수동태를 사용할 것"));
});

test("태그를 떼면서 밑줄 구간 위치를 돌려준다", () => {
  const r = stripUnderlineTags("ab<u>cd</u>ef");
  assert.equal(r.text, "abcdef");
  assert.deepEqual(r.ranges, [[2, 4]]);
});

test("어법을 썼는데 밑줄이 없으면 잡는다", () => {
  const forms: GrammarForm[] = ["passive"];
  assert.deepEqual(missingUnderlinedForms("The bottle **is made** of steel.", forms), ["passive"]);
  assert.deepEqual(missingUnderlinedForms("The bottle <u>is made</u> of steel.", forms), []);
});

test("관계사절만 밑줄 쳐도 인정한다", () => {
  const forms: GrammarForm[] = ["relative"];
  assert.deepEqual(missingUnderlinedForms("a filter <u>which removes bacteria</u> fast", forms), []);
});

test("아예 안 쓴 어법은 밑줄 검사가 잡지 않는다(다른 검사가 잡는다)", () => {
  assert.deepEqual(missingUnderlinedForms("Nothing here at all.", ["passive"] as GrammarForm[]), []);
});

test("밑줄이 없으면 코드가 직접 긋는다", () => {
  const t = "The frame is made of steel. It is the motor that drives it. A filter which removes dust helps.";
  const r = underlineGrammarForms(t, ["passive", "itThat", "relative"] as GrammarForm[]);
  assert.equal(r.added.length, 3);
  assert.equal((r.content.match(/<u>/g) ?? []).length, 3);
  assert.deepEqual(missingUnderlinedForms(r.content, ["passive", "itThat", "relative"] as GrammarForm[]), []);
});

test("이미 밑줄이면 다시 긋지 않는다", () => {
  const t = "The frame <u>is made</u> of steel.";
  const r = underlineGrammarForms(t, ["passive"] as GrammarForm[]);
  assert.equal(r.added.length, 0);
  assert.equal(r.content, t);
});

test("없는 어법은 지어내지 않는다", () => {
  const r = underlineGrammarForms("Nothing relevant here at all.", ["itThat"] as GrammarForm[]);
  assert.equal(r.added.length, 0);
});

test("안내문이 관계부사를 막는지 읽는다", () => {
  assert.ok(forbidsRelativeAdverb("관계부사(where/when/why/how)를 쓰면 점수를 부여하지 않음"));
  assert.ok(forbidsRelativeAdverb("관계부사는 인정되지 않는다."));
  assert.ok(!forbidsRelativeAdverb("관계부사를 배운다."));
});

test("밑줄 안에 섞인 관계부사를 잡는다", () => {
  assert.equal(relativeAdverbInUnderline("<u>which makes it useful where access is limited</u>").length, 1);
  assert.equal(relativeAdverbInUnderline("<u>which removes dust</u>").length, 0);
  assert.equal(relativeAdverbInUnderline("a place <u>where he lived</u>").length, 0, "관계대명사가 없는 밑줄은 이 검사 대상이 아니다");
});
