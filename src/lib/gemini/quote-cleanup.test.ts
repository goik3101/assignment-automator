import { test } from "node:test";
import assert from "node:assert/strict";
import { rewriteUnquoted, findQuoteResidue } from "./quote-cleanup.ts";

// 전체 문장 단위로 적용해 보는 헬퍼 — 호출부(generate-essay.ts)와 같은 방식: 따옴표 앞 + 재구성 + 남은 뒤.
function strip(sentence: string): { out: string; uncertain: boolean } {
  const re = /"([^"]{4,150})"|“([^”]{4,150})”/;
  const m = re.exec(sentence);
  if (!m) return { out: sentence, uncertain: false };
  const q = m[1] ?? m[2];
  const before = sentence.slice(0, m.index);
  const after = sentence.slice(m.index + m[0].length);
  const r = rewriteUnquoted(q, after);
  if (r.uncertain) return { out: sentence, uncertain: true };
  return { out: before + r.text + after.slice(r.consumed), uncertain: false };
}
// 예전 동작(따옴표만 삭제) — 버그 재현용
const naive = (s: string) => s.replace(/"([^"]+)"|“([^”]+)”/, (_m, a, b) => a ?? b);

test("재현: 예전 방식은 '…던졌다.라며'를 남긴다", () => {
  const src = "저자들은 “우리는 2017년에 14개국 약 1만 2,000명에게 질문을 던졌다.”라며 세계 상태에 관한 퀴즈를 제시한다.";
  const old = naive(src);
  assert.ok(old.includes("던졌다.라며"), old);
  assert.ok(findQuoteResidue(old).length > 0);
});

test("수정: 인용문+인용 조사를 함께 재구성한다(…던졌다며)", () => {
  const src = "저자들은 “우리는 2017년에 14개국 약 1만 2,000명에게 질문을 던졌다.”라며 세계 상태에 관한 퀴즈를 제시한다.";
  const { out } = strip(src);
  assert.equal(out, "저자들은 우리는 2017년에 14개국 약 1만 2,000명에게 질문을 던졌다며 세계 상태에 관한 퀴즈를 제시한다.");
  assert.equal(findQuoteResidue(out).length, 0);
});

test("각주가 끼어 있어도 각주는 보존되고 조사 뒤로 붙는다", () => {
  const src = '사정없이 짓밟고 개머리판으로 치고 칼로 찌르며 서로를 죽였다"[1].라고 생생하게 증언하고 있다.';
  const r = rewriteUnquoted("사정없이 짓밟고 서로를 죽였다.", "[1].라고 생생하게 증언하고 있다.");
  assert.equal(r.text, "사정없이 짓밟고 서로를 죽였다고[1]");
  assert.equal(r.consumed, "[1].라고".length);
  assert.ok(src);
});

test("명사구 인용 + 이라고는 이미 문법적이라 조사를 그대로 둔다", () => {
  const { out } = strip('저자는 이를 "역사상 가장 큰 사기극"이라고 표현한다.');
  assert.equal(out, "저자는 이를 역사상 가장 큰 사기극이라고 표현한다.");
});

test("라는 → 는", () => {
  const { out } = strip("그는 “인간은 상상 속에서 협력했다.”라는 주장을 폈다.");
  assert.equal(out, "그는 인간은 상상 속에서 협력했다는 주장을 폈다.");
});

test("인용 조사가 없으면 따옴표만 벗기고 문장부호는 그대로 둔다", () => {
  const { out } = strip('책에는 "세상은 생각보다 나아지고 있다." 라는 표현 대신 이런 문장이 나온다.');
  assert.ok(!out.includes('"'));
});

test("따옴표 뒤 조사가 없는 평범한 경우(문장 끝)", () => {
  const { out } = strip('그는 이렇게 썼다. "세상은 나아지고 있다." 그래서 나는 놀랐다.');
  assert.equal(out, "그는 이렇게 썼다. 세상은 나아지고 있다. 그래서 나는 놀랐다.");
});

test("의문형·해요체 인용은 안전하게 못 바꾸므로 uncertain(따옴표 유지)", () => {
  const a = strip('그는 "지금 뭐 하고 있니?"라고 물었다.');
  assert.equal(a.uncertain, true);
  const b = strip('그는 "정말 좋아요."라고 말했다.');
  assert.equal(b.uncertain, true);
});

test("합쇼체(~입니다/~습니까) 인용은 입니다고처럼 깨지므로 uncertain", () => {
  assert.equal(strip('그는 "이 일을 함께할 자원봉사자들로 말입니다."라고 제안했다.').uncertain, true);
  assert.equal(strip("그는 “만들어 둘 방법은 없겠습니까.”라는 질문을 던졌다.").uncertain, true);
});

test("영문 인용 + 라는: 마침표만 정리", () => {
  const { out } = strip("그는 “Pressure drops as speed rises.”라는 원리를 설명했다.");
  assert.equal(out, "그는 Pressure drops as speed rises라는 원리를 설명했다.");
});

test("사실·숫자·각주는 바뀌지 않는다(숫자·[n] 토큰 집합 동일)", () => {
  const src = "저자들은 “2017년에 14개국 약 1만 2,000명에게 질문했다.”[3]라고 밝혔다.";
  const { out } = strip(src);
  const tokens = (s: string) => (s.match(/\d[\d,]*|\[\d+\]/g) ?? []).join("|");
  assert.equal(tokens(out), tokens(src));
});

test("findQuoteResidue: 정상 문장은 잔여물이 없다", () => {
  assert.equal(findQuoteResidue("그는 이렇게 썼다며 웃었다. 저자는 사기극이라고 표현한다.").length, 0);
});
