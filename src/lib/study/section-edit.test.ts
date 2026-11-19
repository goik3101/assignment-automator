import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSectionEdit, findUniqueSection, getSectionBody, replaceSection, stripUnknownFootnotes } from "./section-edit.ts";

const MD = ["## 자료수집", "### 인물 배경", "옛 배경 문장이다.[1]", "", "### 업적", "업적 문장이다.[2]", "", "## 결론", "결론 문장이다."].join("\n");

test("칸 찾기: 같은 이름이 하나뿐일 때만, 번호·굵게 표시는 무시", () => {
  assert.equal(findUniqueSection(MD, "인물 배경")?.title, "인물 배경");
  assert.equal(findUniqueSection(MD, "**1. 인물 배경**")?.title, "인물 배경");
  assert.equal(findUniqueSection(MD, "없는 칸"), null);
  assert.equal(findUniqueSection(`${MD}\n### 업적\n또`, "업적"), null); // 같은 이름 둘이면 건드리지 않는다
});

test("칸 교체: 그 칸만 바뀌고 소제목·다른 칸·빈 줄은 그대로", () => {
  const out = replaceSection(MD, "인물 배경", "### 인물 배경\n새 배경 문장이다.[1]")!;
  assert.ok(out.includes("### 인물 배경\n새 배경 문장이다.[1]\n\n### 업적"));
  assert.ok(!out.includes("옛 배경"));
  assert.ok(out.includes("업적 문장이다.[2]") && out.includes("## 결론\n결론 문장이다."));
  // 새 글에 소제목이 없어도, 다른 단계 소제목이어도 원래 소제목을 쓴다
  assert.equal(replaceSection(MD, "인물 배경", "## 아무거나\n새 배경.[1]"), replaceSection(MD, "인물 배경", "새 배경.[1]"));
});

test("칸 교체: 하위 소제목이 있는 큰 칸은 통째로 바뀐다", () => {
  const out = replaceSection(MD, "자료수집", "### 자료수집\n통합 본문이다.")!;
  assert.ok(!out.includes("### 인물 배경") && out.includes("통합 본문이다.") && out.includes("## 결론"));
});

test("칸 교체: 못 찾거나 새 글이 비면 null, 되돌리기용 본문 읽기", () => {
  assert.equal(replaceSection(MD, "없는 칸", "x"), null);
  assert.equal(replaceSection(MD, "업적", "### 업적\n"), null);
  assert.equal(getSectionBody(MD, "업적"), "업적 문장이다.[2]");
  // 되돌리기: 바꾸기 전 본문으로 다시 바꾸면 원문과 같다
  const before = getSectionBody(MD, "인물 배경")!;
  const changed = replaceSection(MD, "인물 배경", "### 인물 배경\n딴 글")!;
  assert.equal(replaceSection(changed, "인물 배경", before), MD);
});

test("각주: 출처 목록에 없는 번호만 지운다", () => {
  assert.equal(stripUnknownFootnotes("가나다.[1] 라마바.[7]", [1, 2]), "가나다.[1] 라마바.");
  assert.equal(stripUnknownFootnotes("가나다.[1, 7]", [1]), "가나다. [1]");
  assert.equal(stripUnknownFootnotes("가나다.[2]", [1, 2]), "가나다.[2]");
});

test("채팅 답변에서 수정 블록 떼기: 결과물에 있는 칸일 때만 수정안", () => {
  const reply = ["아래처럼 고쳤어요.", "```section", "### 인물 배경", "새 배경.[1]", "```", "고친 점: 사실을 보강했어요."].join("\n");
  const r = extractSectionEdit(reply, MD);
  assert.deepEqual(r.edit, { heading: "인물 배경", markdown: "새 배경.[1]" });
  assert.ok(!r.reply.includes("```") && r.reply.includes("아래처럼 고쳤어요.") && r.reply.includes("고친 점"));
  // 없는 칸이면 수정안으로 보지 않고 글만 보여 준다
  const bad = extractSectionEdit(["```section", "### 없는 칸", "본문", "```"].join("\n"), MD);
  assert.equal(bad.edit, undefined);
  assert.ok(bad.reply.includes("본문") && !bad.reply.includes("```"));
  // 블록이 없으면 그대로
  assert.deepEqual(extractSectionEdit("그냥 답이에요.", MD), { reply: "그냥 답이에요." });
});

test("칸 교체: 소제목 아래 빈 줄과 끝 빈 줄이 원래대로라 바꿨다 되돌리면 원문과 정확히 같다", () => {
  const md = ["## 평전", "", "### 업적", "", "업적 문장이다.[1]", "", "### 평가", "", "평가 문장이다.", ""].join("\n");
  const before = getSectionBody(md, "업적")!;
  const changed = replaceSection(md, "업적", "### 업적\n딴 글")!;
  assert.ok(changed.includes("### 업적\n\n딴 글\n\n### 평가"));
  assert.equal(replaceSection(changed, "업적", before), md);
});
