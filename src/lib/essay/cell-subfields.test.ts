import { test } from "node:test";
import assert from "node:assert/strict";
import { cellSubfields, isBareCell, expandCells } from "./cell-subfields.ts";

test("안내문 글에서 칸의 하위 칸을 읽는다", () => {
  assert.deepEqual(cellSubfields(["각 번호 칸은 내용과 그 아래 ‘들어갈 말’로 구성됩니다."]), ["내용", "들어갈 말"]);
  assert.deepEqual(cellSubfields(["①~⑥의 6개 칸을 작성한다. 각 칸에는 내용과 들어갈 말을 구성한다."]), ["내용", "들어갈 말"]);
  assert.deepEqual(cellSubfields(["장면마다 그림과 대사를 적는다."]), ["그림", "대사"]);
});

test("그런 말이 없으면 발동하지 않는다", () => {
  assert.deepEqual(cellSubfields(["6개 칸을 작성한다."]), []);
  assert.deepEqual(cellSubfields(["원인과 해결방안을 서술한다."]), []);
  assert.deepEqual(cellSubfields([undefined, ""]), []);
});

test("번호만 적힌 칸을 알아본다", () => {
  assert.ok(isBareCell("①"));
  assert.ok(isBareCell("3"));
  assert.ok(isBareCell("장면 2"));
  assert.ok(!isBareCell("원인"));
  assert.ok(!isBareCell("전달하고자 하는 메시지"));
});

test("번호 칸만 하위 칸까지 펼친다", () => {
  const items = ["책 제목", "①", "②"];
  assert.deepEqual(expandCells(items, ["내용", "들어갈 말"]), ["책 제목", "① 내용", "① 들어갈 말", "② 내용", "② 들어갈 말"]);
});

test("번호 칸이 없거나 하위 칸을 못 읽으면 그대로 둔다", () => {
  assert.deepEqual(expandCells(["원인", "양상"], ["내용", "들어갈 말"]), ["원인", "양상"]);
  assert.deepEqual(expandCells(["①", "②"], []), ["①", "②"]);
});

test("다른 문장의 말을 칸 이름으로 잘못 뽑지 않는다", () => {
  const texts = [
    "카드뉴스는 주요 쟁점을 그림이나 사진 등의 시각 자료와 간략한 글로 제시한다.",
    "①~⑥의 6개 칸을 작성한다. 각 칸에는 내용과 들어갈 말을 구성한다.",
  ];
  assert.deepEqual(cellSubfields(texts), ["내용", "들어갈 말"]);
});

test("칸을 가리키는 말이 섞인 후보는 버린다", () => {
  assert.deepEqual(cellSubfields(["각 칸에는 칸 제목과 칸 내용을 구성한다."]), []);
});
