import { test } from "node:test";
import assert from "node:assert/strict";
import { keywordsOf, covered, residualsAfterRepair } from "./repair-check.ts";

test("지시문에서 확인할 낱말을 뽑는다", () => {
  const w = keywordsOf("수동태(be + p.p.) 문장을 하나 이상 자연스럽게 넣고 그 수동태 부분을 밑줄 표시");
  assert.ok(w.includes("수동태"));
  assert.ok(!w.includes("그"));
});

test("요구한 말이 들어왔으면 통과", () => {
  assert.ok(covered("중화 반응의 이용 사례를 쓸 것", "중화 반응의 이용 사례로 제산제가 있다."));
});

test("안 들어왔으면 남은 것으로 본다", () => {
  assert.ok(!covered("혼합 용액의 온도 변화를 서술", "리트머스 종이가 붉게 변했다."));
});

test("확인할 낱말이 없으면 거짓 경고를 만들지 않는다", () => {
  assert.ok(covered("그 부분을 그리고 이 내용 등", "아무 글"));
});

test("보완 뒤에도 안 바뀌었으면 잡는다", () => {
  const before = [{ label: "A", content: "같은 글" }];
  const after = [{ label: "A", content: "같은 글" }];
  const r = residualsAfterRepair(before, after, [{ label: "A", missing: ["온도 변화"] }]);
  assert.equal(r.length, 1);
  assert.equal(r[0].unchanged, true);
  assert.deepEqual(r[0].stillMissing, ["온도 변화"]);
});

test("고쳐졌으면 아무것도 남지 않는다", () => {
  const before = [{ label: "A", content: "짧은 글" }];
  const after = [{ label: "A", content: "혼합 용액의 온도 변화가 크게 나타났다." }];
  assert.deepEqual(residualsAfterRepair(before, after, [{ label: "A", missing: ["혼합 용액의 온도 변화"] }]), []);
});
