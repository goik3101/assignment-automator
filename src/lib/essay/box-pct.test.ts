import { test } from "node:test";
import assert from "node:assert/strict";
import { itemBoxNote, itemBoxPlan, sanitizeFormBoxes, type FormBox } from "./box-pct.ts";

// 사진 대조(2026-11-27)에서 전용 질문이 돌려준 실제 값
const MATH: FormBox[] = [
  { name: "1. 경제수학 내용 분석하기", pct: 19, hint: "단원명과 경제수학 내용을 분석해 쓰기" },
  { name: "2. 나의 탐구 주제", pct: 5, hint: "탐구 주제 쓰기" },
  { name: "3. 나의 탐구 동기", pct: 6, hint: "탐구를 시작한 동기 쓰기" },
  { name: "4. 탐구 내용과 결과", pct: 29, hint: "탐구한 내용과 결과 쓰기" },
  { name: "5. 본인이 제일 중요하게 생각한 점, 탐구를 통하여 느낀 점, 성장한 점, 변화한 점, 깨달은 점 등을 서술하시오.", pct: 15 },
  { name: "(1). 경제수학 내용 분석내용 :", pct: 10 },
  { name: "(2) 나의 탐구 주제 분석내용 :", pct: 7 },
];
const SOC03: FormBox[] = [
  { name: "탐구 주제", pct: 12 },
  { name: "탐구 동기 및 목적", pct: 14 },
  { name: "자료조사", pct: 14 },
  { name: "문제점", pct: 14 },
  { name: "대안 및 해결 방안", pct: 13 },
  { name: "결론 및 느낀점", pct: 15 },
];

test("사회-03: 같은 크기 칸 6개 → 칸마다 140~180자 안팎(예전 분석은 3·4·3·3·4·5줄로 칸 사이가 들쭉날쭉)", () => {
  const plan = itemBoxPlan(["탐구 주제", "탐구 동기 및 목적", "자료조사", "문제점", "대안 및 해결 방안", "결론 및 느낀점"], SOC03)!;
  assert.equal(plan.boxes.length, 6);
  const t = plan.boxes.map((b) => b.target);
  assert.ok(Math.max(...t) - Math.min(...t) <= 50, `칸 사이 차이 ${t.join(",")}`);
  assert.ok(plan.total >= 900 && plan.total <= 1050, `총 ${plan.total}`);
});

test("수학-02: 큰 칸은 크게·작은 칸은 작게, 칸 하나를 여러 항목이 나눠 쓰면 몫을 나눈다", () => {
  const plan = itemBoxPlan(["단원명", "경제수학 내용", "나의 탐구 주제", "나의 탐구 동기", "탐구 내용", "탐구 결과", "성장한 점", "변화한 점", "깨달은 점"], MATH)!;
  const by = Object.fromEntries(plan.boxes.map((b) => [b.item, b.target]));
  assert.ok(by["나의 탐구 주제"] <= 60, `주제 ${by["나의 탐구 주제"]}`);
  assert.ok(by["경제수학 내용"] > 150, `내용 ${by["경제수학 내용"]}`);
  assert.ok(by["탐구 내용"] > 200, `탐구 내용 ${by["탐구 내용"]}`); // 가장 큰 칸(29%)
  assert.ok(by["성장한 점"] === by["변화한 점"] && by["성장한 점"] === by["깨달은 점"]);
  assert.equal(plan.boxes.find((b) => b.item === "단원명"), undefined); // 단원명은 칸 이름에 없어 맞추지 않는다
});

test("같은 낱말 칸이 둘이면 이름 길이가 더 비슷한 칸을 고른다(2차 활동지 '나의 탐구 주제 분석내용')", () => {
  const plan = itemBoxPlan(["경제수학 내용 분석내용", "나의 탐구 주제 분석내용", "발표할 내용"], MATH)!;
  assert.equal(plan.boxes.find((b) => b.item === "나의 탐구 주제 분석내용")?.pct, 7);
});

test("항목이 칸과 거의 안 맞으면(60% 미만) 쓰지 않는다 — 양식이 아닌 안내문에서 오는 칸은 무시", () => {
  assert.equal(itemBoxPlan(["서론", "본론", "결론", "참고문헌"], SOC03), null);
  assert.equal(itemBoxPlan(["탐구 주제"], SOC03), null);
  assert.equal(itemBoxPlan(undefined, SOC03), null);
  process.env.FORM_BOXES = "off";
  try {
    assert.equal(itemBoxPlan(["탐구 주제", "자료조사"], SOC03), null);
  } finally {
    delete process.env.FORM_BOXES;
  }
});

test("분석 응답 다듬기: 칸이 2개 미만이거나 높이 합이 말이 안 되면 빈 목록, 이름·안내는 길이를 자른다", () => {
  assert.deepEqual(sanitizeFormBoxes([]), []);
  assert.deepEqual(sanitizeFormBoxes([{ name: "주제", pct: 10 }]), []);
  assert.deepEqual(sanitizeFormBoxes([{ name: "주제", pct: 70 }, { name: "동기", pct: 70 }, { name: "결론", pct: 70 }, { name: "마무리", pct: 70 }, { name: "기타칸", pct: 70 }, { name: "여분칸", pct: 70 }]), []);
  const ok = sanitizeFormBoxes([{ name: " 탐구  주제 ", pct: 12.4, hint: "가".repeat(80) }, { name: "동기", pct: 14 }, { name: "x", pct: 5 }, { name: "오류", pct: -3 }]);
  assert.equal(ok.length, 2);
  assert.equal(ok[0].name, "탐구 주제");
  assert.equal(ok[0].pct, 12);
  assert.equal(ok[0].hint?.length, 40);
});

test("문장: 칸 크기와 칸이 요구하는 뜻을 말한다", () => {
  const note = itemBoxNote(itemBoxPlan(["탐구 주제", "나의 탐구 동기", "탐구 내용"], MATH));
  assert.match(note, /양식 칸 크기/);
  assert.match(note, /"나의 탐구 동기" 약 \d+자/);
  assert.equal(itemBoxNote(null), "");
});
