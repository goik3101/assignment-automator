import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { EN } from "./dict.ts";

// 화면 문구를 t("한국어")로 감쌌는데 영어 사전에 없으면 영어 화면에 한국어가 그대로 남는다 — 그걸 막는 검사.
// 문자열 리터럴 키만 본다(템플릿 문자열 ${} 키는 건너뜀).
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name) && !/\.test\./.test(name) && !p.includes(join("lib", "i18n"))) out.push(p);
  }
  return out;
}

const T_CALL = /(?<![\w.$])t\(\s*"((?:[^"\\\n]|\\.)*)"/g;

test("t()로 감싼 한국어 문구는 모두 영어 사전에 있다", () => {
  const missing = new Set<string>();
  for (const file of walk("src")) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(T_CALL)) {
      const key = m[1].replace(/\\"/g, '"').replace(/\\n/g, "\n");
      if (/[가-힣]/.test(key) && !(key in EN)) missing.add(`${file.replace(/\\/g, "/")}: ${key}`);
    }
  }
  assert.deepEqual([...missing].slice(0, 30), [], `영어 사전에 없는 문구 ${missing.size}개`);
});

test("영어 값에 한국어가 남아 있지 않다(자리표시자 제외)", () => {
  const bad = Object.entries(EN).filter(([, v]) => /[가-힣]/.test(v));
  assert.deepEqual(bad.slice(0, 20), []);
});

test("자리표시자가 한국어 키와 영어 값에서 같다", () => {
  const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
  const diff = Object.entries(EN).filter(([k, v]) => ph(k) !== ph(v));
  assert.deepEqual(diff.slice(0, 20), []);
});
