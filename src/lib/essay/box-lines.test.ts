import { test } from "node:test";
import assert from "node:assert/strict";
import { linesInChunk, boxLengths, boxLengthBlock, boxOverflows, boxOverflowRepairText, CHARS_PER_LINE } from "./box-lines.ts";

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

test("칸 크기를 크게 넘친 단계만 잡는다", () => {
  const boxes = boxLengths(LABELS, GUIDE);
  const over = boxOverflows(
    [
      { label: "머리기사", content: "가".repeat(881) },
      { label: "인터뷰", content: "가".repeat(313) },
      { label: "사설/칼럼", content: "가".repeat(276) },
    ],
    boxes
  );
  assert.deepEqual(over.map((o) => o.label), ["머리기사"]);
  assert.equal(over[0].actual, 881);
});

test("조금 넘는 것은 잡지 않는다(손글씨 차이)", () => {
  const boxes = boxLengths(LABELS, GUIDE);
  const head = boxes.find((b) => b.label === "머리기사")!;
  assert.equal(boxOverflows([{ label: "머리기사", content: "가".repeat(Math.round(head.max * 1.6)) }], boxes).length, 0);
  assert.equal(boxOverflows([{ label: "머리기사", content: "가".repeat(Math.round(head.max * 1.8)) }], boxes).length, 1);
});

test("짧은 것은 넘침으로 보지 않는다", () => {
  const boxes = boxLengths(LABELS, GUIDE);
  assert.equal(boxOverflows([{ label: "머리기사", content: "짧다." }], boxes).length, 0);
});

test("칸 크기를 읽지 못한 단계는 검사하지 않는다", () => {
  assert.equal(boxOverflows([{ label: "만평/광고", content: "가".repeat(5000) }], boxLengths(LABELS, GUIDE)).length, 0);
});

test("줄일 지시에 목표 글자 수와 금지 사항이 들어간다", () => {
  const t = boxOverflowRepairText({ label: "머리기사", actual: 881, max: 234, lines: 6 });
  assert.ok(t.includes("881") && t.includes("234") && t.includes("6줄"));
  assert.ok(t.includes("새로운 사실"));
});

// ── 2026-11-08 실측에서 나온 두 가지 오발동 ───────────────
test("그림 칸(만평·만화·삽화)에는 글자 수 목표를 주지 않는다", () => {
  const guide = "만평/광고: 양식 칸은 '제목' 약 1줄, '그림 설명' 약 5줄.";
  assert.deepEqual(boxLengths(["만평/광고"], guide), []);
  assert.deepEqual(boxLengths(["네 컷 만화", "삽화", "그림 칸"], guide.replace("만평/광고", "삽화")), []);
});

test("이름을 못 찾은 칸의 줄 수가 앞 칸으로 쏠리지 않는다", () => {
  // 머리기사만 레이블로 걸리고 뒤 문장들은 안 걸리는 상황(실측: 마지막 레이블이 16줄을 삼켰다).
  const guide = "머리기사: 양식 칸은 '제목' 약 1줄, '내용' 약 5줄. 둘째 칸은 약 4줄. 셋째 칸은 약 6줄.";
  const boxes = boxLengths(["머리기사", "인터뷰", "사설/칼럼"], guide);
  assert.deepEqual(boxes.map((b) => [b.label, b.lines]), [["머리기사", 6]]);
});

test("한 칸에 터무니없이 많은 줄이 잡히면 버린다", () => {
  const guide = "자료 정리 칸은 약 9줄, 그리고 약 9줄 더.";
  assert.deepEqual(boxLengths(["자료 정리"], guide), []);
});

test("정상 안내문은 그대로 읽는다(기존 동작 유지)", () => {
  const boxes = boxLengths(LABELS, GUIDE);
  assert.deepEqual(
    boxes.map((b) => [b.label, b.lines]),
    [["머리기사", 6], ["인터뷰", 9], ["사설/칼럼", 6]]
  );
});

test("단계 이름을 느슨하게 찾는다(안내문은 '사설/칼럼'을 '사설'로 적는다)", () => {
  const guide = "머리기사: '제목' 약 1줄, '내용' 약 5줄. 사설: '제목' 약 1줄, '내용' 약 4줄.";
  assert.deepEqual(
    boxLengths(["머리기사", "사설/칼럼"], guide).map((b) => [b.label, b.lines]),
    [["머리기사", 6], ["사설/칼럼", 5]]
  );
});

test("한 글자 조각으로는 찾지 않는다(아무 데나 걸리면 안 된다)", () => {
  assert.deepEqual(boxLengths(["글/말"], "그 글은 약 3줄로 쓴다."), []);
});
