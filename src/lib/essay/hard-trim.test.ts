import test from "node:test";
import assert from "node:assert/strict";
import { trimToCeiling } from "./hard-trim.ts";
import { submittedLength } from "./submitted-length.ts";

const P = (t: string, n: number) => (t + " ").repeat(n).trim();

test("상한을 넘으면 가운데 문단을 덜어 상한 안으로 넣고 첫·끝 문단은 남긴다(역사 신문 966자 → 상한)", () => {
  const first = P("광복 뒤 정부 수립이 선포됐다.[1]", 8);
  const mid1 = P("미군정이 행정권을 행사했다.[2]", 10);
  const mid2 = P("총선거로 제헌국회가 구성됐다.", 12);
  const last = P("분단의 과제가 남았다.", 6);
  const text = [first, mid1, mid2, last].join("\n\n");
  const r = trimToCeiling(text, submittedLength(text) - 100);
  assert.ok(r.removed >= 1);
  assert.ok(r.content.startsWith(first));
  assert.ok(r.content.endsWith(last));
  assert.ok(submittedLength(r.content) <= submittedLength(text) - 100);
  assert.ok(!r.content.includes(mid2)); // 각주 없는 긴 문단부터
});

test("소제목·표는 건드리지 않고, 본문 문단이 둘 이하이면 덜지 않는다", () => {
  const two = `### 제목\n\n${P("첫 문단이다.", 40)}\n\n${P("끝 문단이다.", 40)}`;
  assert.equal(trimToCeiling(two, 50).removed, 0);
  const withTable = `${P("서론이다.", 30)}\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n${P("본론이다.", 30)}\n\n${P("결론이다.", 30)}`;
  const r = trimToCeiling(withTable, 100);
  assert.match(r.content, /\| a \| b \|/);
});

test("출처 각주가 하나도 안 남게 되는 덜기는 하지 않는다", () => {
  const text = [P("머리말이다.", 10), P("유일한 근거 문장이다.[1]", 12), P("맺음이다.", 10)].join("\n\n");
  assert.equal(trimToCeiling(text, 100).removed, 0);
});

test("상한 안이면 그대로", () => {
  const text = "짧은 글이다.\n\n둘째 문단이다.\n\n셋째 문단이다.";
  assert.equal(trimToCeiling(text, 1000).content, text);
});
