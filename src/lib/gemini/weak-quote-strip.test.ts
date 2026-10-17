import { test } from "node:test";
import assert from "node:assert/strict";
import { stripQuotesWhere, findQuoteResidue } from "./quote-cleanup.ts";

// generate-essay.ts의 QUOTE_PATTERN과 같은 모양.
const QUOTE_PATTERN = /"([^"]{8,150})"|“([^”]{8,150})”|「([^」]{8,150})」|『([^』]{8,150})』/g;
const stripAll = (content: string) => stripQuotesWhere(content, QUOTE_PATTERN, () => true);
const tokens = (s: string) => (s.match(/\d[\d,]*|\[\d+\]/g) ?? []).join("|");

const CASES: Array<[string, string]> = [
  // 실제 결과물에서 관찰된 두 문장
  [
    "저자들은 “우리는 2017년에 14개국 약 1만 2,000명에게 질문을 던졌다.”라며 세계 상태에 관한 간단한 퀴즈를 제시하는데",
    "저자들은 우리는 2017년에 14개국 약 1만 2,000명에게 질문을 던졌다며 세계 상태에 관한 간단한 퀴즈를 제시하는데",
  ],
  [
    "그는 “사정없이 짓밟고 개머리판으로 치고 칼로 찌르며 서로를 죽였다[1].”라고 생생하게 증언하고 있다.",
    "그는 사정없이 짓밟고 개머리판으로 치고 칼로 찌르며 서로를 죽였다고[1] 생생하게 증언하고 있다.",
  ],
  [
    "그는 “사정없이 짓밟고 개머리판으로 치고 칼로 찌르며 서로를 죽였다.[1]”라고 생생하게 증언하고 있다.",
    "그는 사정없이 짓밟고 개머리판으로 치고 칼로 찌르며 서로를 죽였다고[1] 생생하게 증언하고 있다.",
  ],
  [
    "그는 “사정없이 짓밟고 개머리판으로 치고 칼로 찌르며 서로를 죽였다”[1].라고 생생하게 증언하고 있다.",
    "그는 사정없이 짓밟고 개머리판으로 치고 칼로 찌르며 서로를 죽였다고[1] 생생하게 증언하고 있다.",
  ],
  // 인용 조사 대신 간접 인용 어미(고/며)가 바로 붙은 경우
  [
    "보고서는 “참가자의 70%가 오답을 골랐다.”고 밝혔다.",
    "보고서는 참가자의 70%가 오답을 골랐다고 밝혔다.",
  ],
];

for (const [src, expected] of CASES) {
  test(`따옴표 제거 후 문법적인 문장: ${src.slice(0, 30)}…`, () => {
    const { content, strippedCount } = stripAll(src);
    assert.equal(content, expected);
    assert.equal(strippedCount, 1);
    assert.equal(findQuoteResidue(content).length, 0);
    assert.equal(tokens(content), tokens(src)); // 숫자·각주 보존
  });
}

test("predicate가 false인 인용은 건드리지 않는다", () => {
  const src = "그는 “질문을 던져 보았다.”라며 웃었다.";
  assert.deepEqual(stripQuotesWhere(src, QUOTE_PATTERN, () => false), { content: src, strippedCount: 0 });
});

test("안전하게 못 바꾸는 인용(의문형)은 따옴표를 유지하고 onKeep을 부른다", () => {
  const src = "그는 “지금 대체 뭐 하고 있니?”라고 물었다.";
  const kept: string[] = [];
  const r = stripQuotesWhere(src, QUOTE_PATTERN, () => true, (q) => kept.push(q));
  assert.equal(r.content, src);
  assert.equal(r.strippedCount, 0);
  assert.equal(kept.length, 1);
});

test("일반 단어 앞의 고/며는 조사로 보지 않는다(띄어쓰기)", () => {
  const { content } = stripAll("그는 “세상은 생각보다 나아지고 있다.” 고양이처럼 조용히 말했다.");
  assert.equal(content, "그는 세상은 생각보다 나아지고 있다. 고양이처럼 조용히 말했다.");
});
