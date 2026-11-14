import { test } from "node:test";
import assert from "node:assert/strict";
import { BOOK_AUTHOR_BLANK, BOOK_TITLE_BLANK, blankUnverifiedReferenceBook, bookTitleOf } from "./reference-slot.ts";

// 2026-11-14 역사-05 실제 결과물 — 학생 지침에 책이 없는데 없는 책과 "지은이 미상"이 나갔다.
const INVENTED = `### 제목
『일제강점기 독립운동 개론서(근현대사 교과서 수준의 입문서)』

### 저자(지은이)
지은이 미상`;

test("지어낸 참고 도서는 제목·저자를 둘 다 빈칸으로 되돌린다", () => {
  const r = blankUnverifiedReferenceBook(INVENTED, { sourceTitles: ["대한민국임시정부의 어려운 형편 < 사료로 본 한국사"] });
  assert.equal(r.blanked.length, 1);
  assert.ok(r.content.includes(BOOK_TITLE_BLANK));
  assert.ok(r.content.includes(BOOK_AUTHOR_BLANK));
  assert.ok(!r.content.includes("개론서"));
  assert.ok(!r.content.includes("미상"));
});

test("문장으로 길게 풀어 쓴 꼴(참고 도서는 『…』이다. …)도 비운다", () => {
  const t = `### 제목\n\n참고 도서는 『가짜 개론』이다. 이 비교에서는 두 인물을 살펴보았다.\n\n### 저자(지은이)\n\n저자(지은이)는 확인할 수 없다.\n\n## 출처\n[1] x`;
  const r = blankUnverifiedReferenceBook(t, { sourceTitles: [] });
  assert.equal(r.blanked.length, 1);
  assert.ok(!r.content.includes("가짜 개론"));
  assert.ok(r.content.includes("## 출처")); // 뒤의 소제목은 그대로
});

test("학생 지침에 있거나 검색 출처 제목에 나온 책은 건드리지 않는다", () => {
  const ok = `### 제목\n『백범일지』\n\n### 저자(지은이)\n김구`;
  assert.equal(blankUnverifiedReferenceBook(ok, { instructions: "책은 《백범일지》로 할게", sourceTitles: [] }).blanked.length, 0);
  assert.equal(blankUnverifiedReferenceBook(ok, { sourceTitles: ["백범일지 - 한국민족문화대백과"] }).blanked.length, 0);
  // 저자를 모른다고 적었으면 지침에 제목이 있어도 확인된 서지가 아니다
  const unknown = `### 제목\n『백범일지』\n\n### 저자(지은이)\n미상`;
  assert.equal(blankUnverifiedReferenceBook(unknown, { instructions: "백범일지", sourceTitles: [] }).blanked.length, 1);
});

test("이름표 꼴과 이미 빈칸인 경우, 저자 칸이 없는 '제목' 소제목은 건드리지 않는다", () => {
  const label = `- 제목: 『없는 책』\n- 저자(지은이): 홍길동`;
  const r = blankUnverifiedReferenceBook(label, { sourceTitles: [] });
  assert.equal(r.blanked.length, 1);
  assert.equal(r.content, `- 제목: ${BOOK_TITLE_BLANK}\n- 저자(지은이): ${BOOK_AUTHOR_BLANK}`);
  const already = `### 제목\n${BOOK_TITLE_BLANK}\n\n### 저자(지은이)\n${BOOK_AUTHOR_BLANK}`;
  assert.equal(blankUnverifiedReferenceBook(already, { sourceTitles: [] }).blanked.length, 0);
  const notBook = `### 제목\n태평양 전쟁과 원자폭탄\n\n본문입니다.`;
  assert.equal(blankUnverifiedReferenceBook(notBook, { sourceTitles: [] }).content, notBook);
});

test("bookTitleOf: 괄호 낫표 안 제목, 없으면 첫 줄", () => {
  assert.equal(bookTitleOf("참고 도서는 『한국 근현대사』이다."), "한국 근현대사");
  assert.equal(bookTitleOf("백범일지\n설명"), "백범일지");
});
