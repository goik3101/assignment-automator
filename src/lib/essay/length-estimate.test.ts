import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeLengthEstimate } from "./length-estimate.ts";
import { narrowTarget } from "./length-plan.ts";

test("분석이 준 추정 분량: 근거가 있고 상식적인 값만 쓴다", () => {
  assert.deepEqual(sanitizeLengthEstimate(900, "내용 칸 5줄 × 30자", false), { chars: 900, basis: "내용 칸 5줄 × 30자" });
  assert.equal(sanitizeLengthEstimate(0, "", false), undefined); // 모르겠으면 0
  assert.equal(sanitizeLengthEstimate(30, "짧은 칸", false), undefined); // 너무 작다
  assert.equal(sanitizeLengthEstimate(99999, "길다", false), undefined); // 터무니없다
  assert.equal(sanitizeLengthEstimate(900, "", false), undefined); // 근거 없는 숫자는 안 쓴다
  assert.equal(sanitizeLengthEstimate("900" as unknown, "근거", false), undefined);
});

test("안내문에 분량이 적힌 단계면 추정을 버린다 — 기준이 둘이 되면 안 된다", () => {
  assert.equal(sanitizeLengthEstimate(900, "항목 6개", true), undefined);
});

test("추정이 있으면 역할 표보다 그것을 쓴다 (LENGTH_FROM_ANALYZE=on)", () => {
  process.env.LENGTH_FROM_ANALYZE = "on";
  const el = {
    label: "신문 기사 스크랩",
    description: "기사를 찾아 붙인다",
    length_estimate: { chars: 200, basis: "붙일 기사 아래 두세 문장" },
  };
  const t = narrowTarget(el as never);
  assert.equal(t.target, 200); // 역할 표(newspaper 900~1500)가 아니라 분석 값
  assert.equal(t.min, 160);
  assert.equal(t.max, 240);
  assert.match(t.basis, /안내문 사진 기준/);
  delete process.env.LENGTH_FROM_ANALYZE;
});

test("추정이 없으면 예전 그대로(역할 표 + 항목 바닥값)", () => {
  const el = { label: "탐구 보고서", description: "보고서", required_items: ["가", "나", "다", "라", "마", "바"] };
  const t = narrowTarget(el as never);
  assert.ok(t.target >= 900, `항목 6개면 900자 이상이어야 하는데 ${t.target}`);
  assert.doesNotMatch(t.basis, /사진/);
});

test("기본(꺼짐)에서는 추정을 무시하고 역할 표로 돌아간다 — 실측에서 0.14~0.88배로 짧았다", () => {
  try {
    const el = { label: "신문 기사 스크랩", description: "스크랩", length_estimate: { chars: 200, basis: "두세 문장" } };
    // 스위치는 "저장할지"(analyze.ts)와 "쓸지"(narrowTarget) 두 곳에서 본다.
    // sanitize 자체는 값만 검사한다 — 순수 함수로 두는 쪽이 테스트가 쉽다.
    assert.notEqual(narrowTarget(el as never).target, 200);
  } finally {
    delete process.env.LENGTH_FROM_ANALYZE;
  }
});

test("켜 두면 분석 값이 쓰인다는 것도 함께 묶어 둔다", () => {
  process.env.LENGTH_FROM_ANALYZE = "on";
  try {
    const el = { label: "탐구 보고서", description: "", length_estimate: { chars: 1200, basis: "항목 6개 × 두세 문장" } };
    assert.equal(narrowTarget(el as never).target, 1200);
  } finally {
    delete process.env.LENGTH_FROM_ANALYZE;
  }
});
