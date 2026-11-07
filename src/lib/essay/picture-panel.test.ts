import { test } from "node:test";
import assert from "node:assert/strict";
import { isPicturePanel, stripPanelCitations, panelBodyLength, isTooWordy } from "./picture-panel.ts";

test("그림으로 내는 칸을 알아본다", () => {
  assert.ok(isPicturePanel("만평/광고"));
  assert.ok(isPicturePanel("삽화"));
  assert.ok(!isPicturePanel("머리기사"));
  assert.ok(!isPicturePanel("사설/칼럼"));
});

test("그림 칸의 각주를 뗀다", () => {
  const r = stripPanelCitations("38선으로 나뉘었다.[2] 협상은 멈췄다.[3]");
  assert.equal(r.removed, 2);
  assert.ok(!/\[\d+\]/.test(r.content));
  assert.ok(r.content.includes("38선으로 나뉘었다."));
});

test("각주가 없으면 글을 그대로 둔다", () => {
  const t = "투표함 앞의 시민을 그린다.";
  assert.equal(stripPanelCitations(t).content, t);
});

test("소제목을 뺀 본문 길이를 센다", () => {
  assert.equal(panelBodyLength("### 제목\n\n가나다 라마바"), 6);
});

test("그림 한 장 계획치고 너무 길면 잡는다", () => {
  assert.ok(isTooWordy("가".repeat(500)));
  assert.ok(!isTooWordy("### 제목\n그릴 그림: 투표함 앞의 시민.\n무엇을 비판하는가: 분단."));
});
