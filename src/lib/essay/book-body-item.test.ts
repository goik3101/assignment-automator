import { test } from "node:test";
import assert from "node:assert/strict";
import { withBookBodyItem, BOOK_BODY_ITEM } from "./book-body-item.ts";

// 2026-11-19 책 처방전 3차시: 칸이 제목·저자·구절뿐이라 소개·처방이 어디에도 안 쓰였다(327자).
test("서지 값과 구절뿐인 책 소개 단계에는 소개 본문 칸을 보탠다", () => {
  const core = { task_elements: [{ type: "text_submission", description: "친구의 문제 상황에 도움을 줄 수 있는 책을 소개한다.", required_items: ["책 제목", "저자", "인상적인 구절"] }] };
  const out = withBookBodyItem(core);
  assert.deepEqual(out.task_elements[0].required_items, ["책 제목", "저자", "인상적인 구절", BOOK_BODY_ITEM]);
});

test("소개를 말하지 않거나 다른 칸이 섞인 단계는 건드리지 않는다", () => {
  const plain = { task_elements: [{ type: "text_submission", description: "독서 기록을 적는다.", required_items: ["책 제목", "저자", "인상적인 구절"] }] };
  assert.equal(withBookBodyItem(plain), plain);
  const mixed = { task_elements: [{ type: "text_submission", description: "책을 소개한다.", required_items: ["책 제목", "소개 이유", "구절"] }] };
  assert.equal(withBookBodyItem(mixed), mixed);
  const once = withBookBodyItem({ task_elements: [{ type: "text_submission", description: "책을 소개한다.", required_items: ["책 제목", "저자"] }] });
  assert.equal(withBookBodyItem(once), once); // 보탠 칸이 있으면 두 번 보태지 않는다
});
