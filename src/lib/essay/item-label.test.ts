import test from "node:test";
import assert from "node:assert/strict";
import { stripFlowingItemLabels } from "./item-label.ts";

const ITEMS = ["태평양 전쟁 당시의 국제 정세", "태평양 전쟁의 배경 및 전개 과정", "미국이 원자폭탄을 투하하게 된 경위", "원자폭탄 투하에 대한 자신의 입장"];

test("항목 이름이 문단 머리 라벨로 묻어 나온 것을 뗀다(역사-01)", () => {
  const text = [
    "태평양 전쟁 당시의 국제 정세와 전쟁의 배경: 일본은 동아시아에서 세력을 넓히며 중국과 전쟁을 벌였다.[1]",
    "전개: 태평양 전쟁은 일본의 공격으로 시작된 뒤 여러 지역에서 이어졌다.",
    "미국이 원자폭탄을 투하하게 된 경위: 미국은 일본의 항복을 앞당기려 했다.",
  ].join("\n\n");
  const r = stripFlowingItemLabels(text, ITEMS);
  assert.equal(r.stripped.length, 3);
  assert.ok(r.content.startsWith("일본은 동아시아에서"));
  assert.ok(!/전개:/.test(r.content));
});

test("일반 말머리·칸 이름표·항목과 무관한 앞머리는 그대로 둔다", () => {
  const text = "예를 들어: 학교 급식에서 과일을 눈에 띄는 곳에 두면 선택이 달라진다.\n제목: 원자폭탄 투하에 대한 나의 입장을 쓰다 보면\n결론: 짧다";
  const r = stripFlowingItemLabels(text, ITEMS);
  assert.equal(r.content, text);
  assert.equal(r.stripped.length, 0);
});
