import { test } from "node:test";
import assert from "node:assert/strict";
import { sameAttribution } from "./attribution-name.ts";

test("표기만 다른 같은 저자(30회 테스트 실측 3건)는 같다고 본다", () => {
  assert.equal(sameAttribution("마셜 B. 로젠버그", "Marshall B. Rosenberg (마셜 B. 로젠버그, 또는 마샬 B. 로젠버그)"), true);
  assert.equal(sameAttribution("케빈 리먼", "Kevin Leman (한국어 표기: 케빈 리먼)"), true);
  assert.equal(sameAttribution("기시미 이치로, 고가 후미타케", "기시미 이치로; 고가 후미타케"), true);
  assert.equal(sameAttribution("파울로 코엘료", "파울로 코엘료 (Paulo Coelho)"), true);
  assert.equal(sameAttribution("전승환 지음", "전승환"), true);
});

test("다른 사람은 다르다", () => {
  assert.equal(sameAttribution("김나이", "전승환"), false);
  assert.equal(sameAttribution("이지성", "기시미 이치로"), false);
});
