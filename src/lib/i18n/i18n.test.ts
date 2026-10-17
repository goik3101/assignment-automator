import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLang, parseLang, translate } from "./core.ts";

const dict = { "새 창작물": "New creation", "{n}개 남았어요": "{n} left" };

test("영어일 때만 사전을 쓰고, 없으면 한국어 그대로", () => {
  assert.equal(translate("ko", dict, "새 창작물"), "새 창작물");
  assert.equal(translate("en", dict, "새 창작물"), "New creation");
  assert.equal(translate("en", dict, "사전에 없는 문구"), "사전에 없는 문구");
});

test("자리표시자를 채운다", () => {
  assert.equal(translate("en", dict, "{n}개 남았어요", { n: 3 }), "3 left");
  assert.equal(translate("ko", dict, "{n}개 남았어요", { n: 3 }), "3개 남았어요");
  assert.equal(translate("en", dict, "{x}", {}), "{x}");
});

test("언어 판별", () => {
  assert.equal(parseLang("en"), "en");
  assert.equal(parseLang("fr"), "ko");
  assert.equal(detectLang("en-US,en;q=0.9"), "en");
  assert.equal(detectLang("ko-KR,ko;q=0.9"), "ko");
  assert.equal(detectLang(null), "ko");
});
