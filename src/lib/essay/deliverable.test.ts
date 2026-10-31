import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNewspaperBlock } from "./deliverable.ts";

test("신문 영역이 각각 별개 단계면 그 칸 하나만 쓰게 한다", () => {
  // 실측(결과물.10): "이 단계는 신문 그 자체다"라는 지시 때문에 머리기사 안에 인터뷰·사설·만평이 다 들어갔다.
  const many = buildNewspaperBlock({ label: "머리기사", requiredItems: ["제목", "내용"], materialLabels: [], sectionOfMany: true });
  assert.ok(many.includes("신문 전체가 아니라"));
  assert.ok(many.includes("다른 영역"));
  assert.ok(many.includes("제호)·날짜·호수·기자 이름을 쓰지 말 것"), "칸 하나를 쓸 때는 제호를 금지해야 한다");
  const solo = buildNewspaperBlock({ label: "현대사 신문", requiredItems: ["머리기사", "인터뷰"], materialLabels: [] });
  assert.ok(solo.includes("제호"));
});
