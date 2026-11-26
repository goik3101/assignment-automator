import { test } from "node:test";
import assert from "node:assert/strict";
import { itemShareNote, nameOnlyItems, reflectionItems, topicItems } from "./item-share.ts";

const MATH = ["단원명", "경제수학 내용", "나의 탐구 주제", "나의 탐구 동기", "탐구 내용", "탐구 결과", "탐구를 통해 느낀 점", "성장한 점", "변화한 점", "깨달은 점"];

test("칸 종류: 생각을 푸는 칸과 이름만 적는 칸을 가른다(2026-11-26 수학-02)", () => {
  assert.deepEqual(reflectionItems(MATH), ["탐구를 통해 느낀 점", "성장한 점", "변화한 점", "깨달은 점"]);
  assert.deepEqual(nameOnlyItems(MATH), ["단원명"]);
  // 사실을 설명하는 칸·주제 칸은 건드리지 않는다
  assert.deepEqual(reflectionItems(["탐구 주제", "자료조사", "문제점", "대안 및 해결 방안"]), []);
  assert.deepEqual(reflectionItems(["결론 및 느낀점", "궁금증에 대한 후속 탐구 계획", "생각 넓히기", "제작 후기"]).length, 4);
});

test("필수 항목 블록 문장: 해당 칸이 있을 때만 붙고 ITEM_SHARE_NOTE=off로 꺼진다", () => {
  const note = itemShareNote(MATH);
  assert.match(note, /"탐구를 통해 느낀 점"·"성장한 점"·"변화한 점"·"깨달은 점" 칸은 학생의 생각을 풀어 쓰는 칸/);
  assert.match(note, /"단원명" 칸은 이름만 적는 한 줄 칸/);
  assert.equal(itemShareNote(["자료조사", "문제점", "대안 및 해결 방안"]), "");
  process.env.ITEM_SHARE_NOTE = "off";
  try {
    assert.equal(itemShareNote(MATH), "");
  } finally {
    delete process.env.ITEM_SHARE_NOTE;
  }
});

test("서지 칸 문장과 함께 있어도 두 문장이 모두 나온다", () => {
  const note = itemShareNote(["책 제목", "저자", "책 소개", "느낀 점"]);
  assert.match(note, /"책 제목"·"저자" 칸은 이름·값만 한 줄로/);
  assert.match(note, /"느낀 점" 칸은 학생의 생각을 풀어 쓰는 칸/);
});

test("양식 칸 줄 수 같은 단계 상한이 있으면 '길게'를 말하지 않는다(안내문 조건이 우선)", () => {
  assert.equal(itemShareNote(MATH, { boxLimited: true }), "");
  assert.match(itemShareNote(["책 제목", "저자", "느낀 점"], { boxLimited: true }), /"책 제목"·"저자" 칸은 이름·값만 한 줄로/);
});

test("주제를 적는 작은 칸은 한두 문장 — '정확히 주제'(서지 값 칸)·'주제 선정 이유'는 건드리지 않는다(2026-11-26 과학-05·수학-02)", () => {
  assert.deepEqual(topicItems(["생명과학 연구주제", "연구의 과학적 내용(이론)"]), ["생명과학 연구주제"]);
  assert.deepEqual(topicItems(["나의 탐구 주제", "나의 탐구 동기", "탐구 주제"]), ["나의 탐구 주제", "탐구 주제"]);
  assert.deepEqual(topicItems(["주제", "주제 선정 동기", "주제 선정의 배경(이유)", "토론 주제 분석"]), []);
  assert.match(itemShareNote(["생명과학 연구주제", "연구과정"]), /"생명과학 연구주제" 칸은 주제를 한두 문장으로 분명히 쓴다/);
  assert.equal(itemShareNote(["탐구 주제", "자료조사"], { boxLimited: true }), ""); // 칸 줄 수 상한이면 안내문이 우선
});
