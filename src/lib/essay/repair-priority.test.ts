import { test } from "node:test";
import assert from "node:assert/strict";
import { GRACE_MS, describeMust, honestyRepairOn, mustRepairs, onlyMustAffordable, type Rewrite } from "./repair-priority.ts";

const withEnv = (v: string | undefined, fn: () => void) => {
  const old = process.env.HONESTY_REPAIR;
  if (v === undefined) delete process.env.HONESTY_REPAIR;
  else process.env.HONESTY_REPAIR = v;
  try {
    fn();
  } finally {
    if (old === undefined) delete process.env.HONESTY_REPAIR;
    else process.env.HONESTY_REPAIR = old;
  }
};

const ALL: Rewrite[] = [
  { label: "머리기사", instruction: "안 한 활동 고칠 것", must: "honesty" },
  { label: "머리기사", instruction: "나열 항목을 줄 나눠 쓸 것" },
  { label: "사설", instruction: "없는 수치를 빼거나 노트 값으로 바꿀 것", must: "honesty" },
  { label: "개요", instruction: "안내문이 요구한 조건을 채울 것", must: "notice" },
  { label: "만평", instruction: "칸을 넘쳤으니 줄일 것" },
];

test("반드시 고칠 것(거짓·안내문 조건)만 골라낸다", () => {
  withEnv(undefined, () => {
    const picked = mustRepairs(ALL);
    assert.equal(picked.length, 3);
    assert.deepEqual(
      picked.map((r) => r.label),
      ["머리기사", "사설", "개요"]
    );
    // 형식·분량·문체는 빠진다 — 못 고쳐도 거짓이 되거나 안내문을 어기는 것은 아니다
    assert.ok(!picked.some((r) => r.instruction.includes("칸을 넘쳤")));
  });
});

test("무엇 때문에 예산을 넘기는지 로그에 적는다", () => {
  assert.equal(describeMust(mustRepairs(ALL)), "거짓 2건, 안내문 조건 1건");
  assert.equal(describeMust([{ label: "a", instruction: "x", must: "notice" }]), "안내문 조건 1건");
  assert.equal(describeMust([]), "");
});

test("스위치를 끄면 특례가 없다(예전처럼 한 묶음)", () => {
  withEnv("off", () => {
    assert.equal(honestyRepairOn(), false);
    assert.equal(mustRepairs(ALL).length, 0);
  });
});

test("표시가 없으면 특례도 없다", () => {
  withEnv(undefined, () => {
    assert.equal(mustRepairs(ALL.filter((r) => !r.must)).length, 0);
  });
});

test("남은 시간이 보완 한 번보다 적으면 반드시 고칠 것만 고친다", () => {
  assert.equal(onlyMustAffordable(400, 7000), true); // 실측 x1.log: 29.6초 썼고 남은 0.4초
  assert.equal(onlyMustAffordable(3200, 7000), true); // 실측 hon6.log: 26.8초 썼고 남은 3.2초
  assert.equal(onlyMustAffordable(7000, 7000), false);
  assert.equal(onlyMustAffordable(12000, 7000), false);
});

test("추가 시간은 보완 한 번(실측 4.8초)이 끝날 만큼은 된다", () => {
  assert.ok(GRACE_MS >= 5000);
});
