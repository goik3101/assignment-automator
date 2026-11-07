import { test } from "node:test";
import assert from "node:assert/strict";
import { linesInChunk, boxLengths, boxLengthBlock, CHARS_PER_LINE } from "./box-lines.ts";

const GUIDE =
  "머리기사: 양식 칸은 ‘제목’ 약 1줄, ‘내용’ 약 5줄. 기사에 누가·언제·어디서가 드러나게 할 것. " +
  "인터뷰: ‘인터뷰 대상’ 약 1줄, 질문1·답변1·질문2·답변2는 각각 약 2줄. " +
  "사설/칼럼: ‘제목’ 약 1줄, ‘내용’ 약 5줄. " +
  "만평/광고: 글을 쓰는 이름표 칸 없이 그림을 구성하는 빈 칸이다.";
const LABELS = ["머리기사", "인터뷰", "사설/칼럼", "만평/광고"];

test("한 칸의 줄 수를 더한다", () => {
  assert.equal(linesInChunk("‘제목’ 약 1줄, ‘내용’ 약 5줄."), 6);
});

test("'각각 N줄'은 앞의 나열 개수만큼 곱한다", () => {
  assert.equal(linesInChunk("‘인터뷰 대상’ 약 1줄, 질문1·답변1·질문2·답변2는 각각 약 2줄."), 1 + 2 * 4);
});

test("단계별로 칸 크기를 읽는다", () => {
  const boxes = boxLengths(LABELS, GUIDE);
  const head = boxes.find((b) => b.label === "머리기사");
  assert.equal(head?.lines, 6);
  assert.ok(head && head.min < 6 * CHARS_PER_LINE && head.max > 6 * CHARS_PER_LINE);
  assert.equal(boxes.find((b) => b.label === "인터뷰")?.lines, 9);
  assert.equal(boxes.find((b) => b.label === "사설/칼럼")?.lines, 6);
});

test("줄 수를 말하지 않은 칸은 빠진다(추측하지 않는다)", () => {
  assert.equal(boxLengths(LABELS, GUIDE).some((b) => b.label === "만평/광고"), false);
});

test("안내문에 줄 수가 없으면 아무것도 만들지 않는다", () => {
  assert.deepEqual(boxLengths(LABELS, "출처를 밝힌다."), []);
  assert.deepEqual(boxLengths([], GUIDE), []);
  assert.equal(boxLengthBlock([]), "");
});

test("블록에 칸마다 글자 범위가 들어간다", () => {
  const b = boxLengthBlock(boxLengths(LABELS, GUIDE));
  assert.ok(b.includes("머리기사"));
  assert.ok(/\d+~\d+자/.test(b));
  assert.ok(b.includes("필수 항목을 빼지는 말 것"));
});
