import test from "node:test";
import assert from "node:assert/strict";
import { dropDeadSourceFigures } from "./dead-source-figures.ts";
import { stripInvalidCitationMarkers } from "../gemini/citations.ts";

// 2026-11-22 사회-02: 죽은 출처의 각주를 먼저 떼면 "죽은 출처를 가리키는 각주"가 없어 수치 문장을 못 찾는다 — 근거 없는 "92.2%"가 각주도 표시도 없이 남았다.
test("지울 문장은 각주를 떼기 전에 지운다(순서가 바뀌면 근거 없는 수치가 남는다)", () => {
  const c = "해안쓰레기에서 플라스틱 비율은 2019년 81%에서 2022년 92.2%로 늘었다.[2] 수거 체계도 함께 살펴야 한다.[2] 인력은 1,300명이다.[1]";
  const dead = new Set([2]);
  // 올바른 순서: 먼저 지우고 나서 떼면 수치 문장이 사라지고 숫자 없는 문장은 각주만 사라진다.
  const right = stripInvalidCitationMarkers(dropDeadSourceFigures(c, [2]).content, dead);
  assert.ok(!right.includes("92.2"));
  assert.ok(right.includes("수거 체계도 함께 살펴야 한다."));
  assert.ok(right.includes("1,300명이다.[1]"));
  // 예전 순서: 먼저 떼면 지울 문장이 "각주 없는 문장"이 되어 그대로 남는다.
  const wrong = dropDeadSourceFigures(stripInvalidCitationMarkers(c, dead), [2]);
  assert.ok(wrong.content.includes("92.2%"));
  assert.equal(wrong.removed.length, 0);
});

test("죽은 출처만 근거로 든 수치 문장은 지우고, 숫자 없는 문장은 각주만 뗀다(사회 탐구주제선정)", () => {
  const c = "농가의 65세 이상 인구 비율은 2023년 52.6%였다.[1] 이 수치만으로 인력 부족을 알 수는 없다.[1] 정책은 2026년 100%를 목표로 한다.[2]";
  const r = dropDeadSourceFigures(c, [1]);
  assert.ok(!r.content.includes("52.6"));
  assert.ok(r.content.includes("이 수치만으로 인력 부족을 알 수는 없다."));
  assert.ok(!/\[1\]/.test(r.content));
  assert.ok(r.content.includes("100%를 목표로 한다.[2]"));
  assert.equal(r.removed.length, 1);
  // 죽은 출처가 없으면 그대로
  assert.equal(dropDeadSourceFigures(c, []).content, c);
  // 살아 있는 출처가 함께 있으면 수치 문장도 남긴다
  assert.ok(dropDeadSourceFigures("2023년 52.6%였다.[1,2]", [1]).content.includes("52.6%였다.[2]"));
});
