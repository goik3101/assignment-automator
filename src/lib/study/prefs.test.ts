import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_STUDY_PREFS, prefsSignature, sanitizeMemorizePrefs, sanitizeStudyPrefs, sanitizeSummaryPrefs } from "./prefs.ts";

test("AI 설정: 잘못된 값은 기본값으로", () => {
  assert.deepEqual(sanitizeStudyPrefs(null), DEFAULT_STUDY_PREFS);
  assert.deepEqual(sanitizeSummaryPrefs({ detail: "detailed", format: "prose", easy: "yes" }), { detail: "detailed", format: "prose", easy: false });
  assert.deepEqual(sanitizeSummaryPrefs({ detail: "nope" }), DEFAULT_STUDY_PREFS.summary);
});

test("옛 설정(퀴즈·플래시카드 값이 든 저장본)을 읽어도 새 모양만 남는다", () => {
  const old = { quiz: { types: ["ox"], count: 30 }, flashcards: { count: 50 }, summary: { detail: "brief", format: "bullets", easy: true }, memorize: { mnemonic: false } };
  assert.deepEqual(sanitizeStudyPrefs(old), { summary: { detail: "brief", format: "bullets", easy: true }, memorize: { mnemonic: false } });
});

test("설정이 다르면 서명도 다르고, 같으면 같다(저장된 요약 재사용 기준)", () => {
  const a = sanitizeSummaryPrefs({ detail: "brief" });
  assert.equal(prefsSignature(a), prefsSignature(sanitizeSummaryPrefs({ detail: "brief" })));
  assert.notEqual(prefsSignature(a), prefsSignature(sanitizeSummaryPrefs({ detail: "detailed" })));
  // 기본 요약 설정의 서명은 바뀌지 않아야 한다 — 바뀌면 모든 사용자의 저장된 요약이 다시 만들어진다.
  assert.equal(prefsSignature(DEFAULT_STUDY_PREFS.summary), '{"detail":"standard","format":"bullets","easy":false}');
});

test("암기 설정: 두음 보조는 기본 켜짐, 잘못된 값은 기본값", () => {
  assert.equal(sanitizeStudyPrefs(null).memorize.mnemonic, true);
  assert.equal(sanitizeStudyPrefs({ memorize: { mnemonic: false } }).memorize.mnemonic, false);
  assert.equal(sanitizeMemorizePrefs({ mnemonic: "no" }).mnemonic, true);
});
