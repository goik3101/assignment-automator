import test from "node:test";
import assert from "node:assert/strict";
import { dropDeadSourceFigures } from "./dead-source-figures.ts";

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
