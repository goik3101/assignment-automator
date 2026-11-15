import test from "node:test";
import assert from "node:assert/strict";
import { reconcileItemLabels } from "./item-reconcile.ts";

const TRANSCRIPT = [
  "가. 지질학적 특징 이해",
  "국가지질공원의 지질명소를 선택하고 그 지질 명소의 지질학적 특징 조사하기",
  "- 지질명소 이름",
  "- 행정 구역",
  "- 주요 암석",
  "- 발견되는 지질 구조나 지형적 특징 1가지 이상",
  "나. 지질 형성 과정 추론",
  "- 지층이 생성된 시대",
  "- 지질학적 특징을 근거로 지질 형성 과정과 지각 변동의 역사를 설명하기",
].join("\n");

test("분석이 잘못 읽은 칸 이름을 전사에 맞춰 바로잡는다(과학-06 행정 구역)", () => {
  const r = reconcileItemLabels(["지질명소 이름", "형성 구역", "주요 암석", "지층이 형성된 시기"], TRANSCRIPT);
  assert.deepEqual(r.items, ["지질명소 이름", "행정 구역", "주요 암석", "지층이 생성된 시대"]);
  assert.equal(r.changed.length, 2);
});

test("전사에 이미 있는 이름과 전사에 비슷한 줄이 없는 이름은 건드리지 않는다", () => {
  const r = reconcileItemLabels(["주요 암석", "국가지질공원의 가치", "지속가능한 발전 방안"], TRANSCRIPT);
  assert.deepEqual(r.items, ["주요 암석", "국가지질공원의 가치", "지속가능한 발전 방안"]);
  assert.equal(r.changed.length, 0);
});

test("전사가 없거나 너무 짧으면 그대로", () => {
  assert.deepEqual(reconcileItemLabels(["형성 구역"], undefined).items, ["형성 구역"]);
  assert.deepEqual(reconcileItemLabels(["형성 구역"], "짧음").items, ["형성 구역"]);
});
