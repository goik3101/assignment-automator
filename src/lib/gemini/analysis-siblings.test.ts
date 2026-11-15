import test from "node:test";
import assert from "node:assert/strict";
import { dropRepeatedSiblingItems } from "./analysis-normalize.ts";

const FOUR = ["실현 가능성", "윤리성", "경제성(비용 절감)", "파급성"];
test("뒤 단계가 앞 단계와 같은 네 칸을 또 가지면 뺀다 (사회-02 5,063자)", () => {
  const els = [
    { label: "정책 평가", required_items: FOUR, items_format: "sections" as const },
    { label: "정책 기대효과", required_items: [...FOUR, "제안하는 정책의 기대효과"], items_format: "sections" as const },
  ];
  const r = dropRepeatedSiblingItems(els);
  assert.deepEqual(r[0].required_items, FOUR);
  assert.equal(r[1].required_items, undefined);
  assert.equal(r[1].items_format, "flowing");
});
test("겹치지 않으면 그대로", () => {
  const els = [{ label: "A", required_items: ["가", "나", "다"] }, { label: "B", required_items: ["라", "마", "바"] }];
  assert.equal(dropRepeatedSiblingItems(els)[1].required_items?.length, 3);
});
