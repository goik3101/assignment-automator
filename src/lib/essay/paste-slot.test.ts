import { test } from "node:test";
import assert from "node:assert/strict";
import { blankPastedMetadata, normalizeAttachmentSlot } from "./paste-slot.ts";

const SLOT = "제목: [직접 작성: 기사 제목]\n날짜: 2025년 1월 2일\n출처: 서울신문\n\n[붙일 자료: 기사 본문 — 출력해서 붙일 것]";

test("붙이는 칸의 지어낸 서지를 빈칸으로 되돌린다", () => {
  const r = blankPastedMetadata(SLOT);
  assert.equal(r.blanked.length, 2);
  assert.ok(r.content.includes("날짜: [직접 작성: 붙인 기사의 날짜]"));
  assert.ok(r.content.includes("출처: [직접 작성: 붙인 기사의 출처]"));
});

test("이미 빈칸인 줄은 건드리지 않는다", () => {
  const r = blankPastedMetadata(SLOT);
  assert.ok(r.content.includes("제목: [직접 작성: 기사 제목]"));
  assert.ok(!r.blanked.some((b) => b.label === "제목"));
});

test("붙임 표시가 없는 글은 손대지 않는다(실험 날짜 등)", () => {
  const t = "날짜: 2026년 3월 2일\n실험을 시작했다.";
  const r = blankPastedMetadata(t);
  assert.equal(r.content, t);
  assert.equal(r.blanked.length, 0);
});

test("서지가 아닌 줄은 그대로 둔다", () => {
  const t = "[붙일 자료: 기사]\n주제: 노인 빈곤 문제\n원인: 연금이 적다.";
  assert.equal(blankPastedMetadata(t).blanked.length, 0);
});

test("대괄호가 후처리에 떨어져 나가도 붙임 칸으로 알아본다 (사회 평가지 실측 5/6)", () => {
  // 우리 후처리가 짝 안 맞는 대괄호를 정리하면 괄호가 사라진다 — 그때도 서지 줄을 비워야 한다.
  const t = "제목: “‘줬다뺏는’기초연금…빈곤노인 67만명”\n날짜: 2024년 9월 23일\n출처: 연합뉴스\n\n붙일 자료: 기사 본문 — 출력해서 붙일 것";
  const r = blankPastedMetadata(t);
  assert.equal(r.blanked.length, 3);
  assert.ok(r.content.includes("[직접 작성: 붙인 기사의 날짜]"));
  assert.ok(r.content.includes("[직접 작성: 붙인 기사의 출처]"));
  assert.ok(!r.content.includes("연합뉴스"));
});

test("붙임 표시의 여러 꼴을 다 알아본다", () => {
  for (const mark of [
    "[붙일 자료: 기사]",
    "붙일 자료: 기사",
    "**붙일 자료:** 기사",
    "- 붙일 자료: 기사",
    "붙일 자료 : 기사",
  ]) {
    const r = blankPastedMetadata(`날짜: 2024년 9월 23일\n${mark}`);
    assert.equal(r.blanked.length, 1, mark);
  }
  // 붙임 표시가 없는 단계는 건드리지 않는다(실험 날짜 등 정당한 값)
  assert.equal(blankPastedMetadata("날짜: 2024년 9월 23일\n실험을 진행했다.").blanked.length, 0);
});

test("칸 이름 앞의 꾸밈말까지 알아본다 (실측: '보도 날짜'만 지어낸 값으로 남았다)", () => {
  const t =
    "기사 제목: [직접 작성: 기사 제목]\n보도 날짜: 2026년 6월 9일\n출처: [직접 작성: 붙인 기사의 출처]\n붙일 자료: 기사 본문 — 출력해서 붙일 것";
  const r = blankPastedMetadata(t);
  assert.equal(r.blanked.length, 1);
  assert.equal(r.blanked[0].label, "보도 날짜");
  assert.ok(!r.content.includes("2026년 6월 9일"));
});

test("칸 이름이 아닌 줄은 건드리지 않는다", () => {
  const t =
    "선정 기준: 노인 빈곤을 다룬 기사를 고른다.\n찾을 기사: 기초연금 효과가 정체됐다는 보도.\n붙일 자료: 기사 본문 — 출력해서 붙일 것";
  assert.equal(blankPastedMetadata(t).blanked.length, 0);
});

test("붙임 칸을 코드가 바로잡는다 — 거절문 제거 + 서지 비우기 + 표시 복구 (사회 평가지 실측)", async () => {
  const { findRefusalSentences } = await import("./refusal.ts");
  // 보완이 붙임 표시를 지우고 사용자에게 말을 거는 글로 바꿔 놓은 실제 모양
  const broken =
    "제목: 원문 확인 필요\n날짜: 원문 확인 필요\n출처: 이데일리\n\n[이데일리 기사 원문이 제공되지 않아 기사 본문을 붙일 수 없습니다. 기사 링크나 원문을 보내 주시면 제목·날짜·출처를 포함해 재편집 없이 정리해 드릴 수 있습니다.]";
  const r = normalizeAttachmentSlot(broken, findRefusalSentences);
  assert.ok(!r.content.includes("이데일리"), "지어낸 신문사가 남았다");
  assert.ok(!r.content.includes("보내 주시면"), "사용자에게 말을 거는 거절문이 남았다");
  assert.ok(/붙일\s*자료\s*[:：]/.test(r.content), "붙임 표시가 복구되지 않았다");
  assert.ok(r.content.includes("[직접 작성: 붙인 기사의 출처]"));
});

// 2026-11-14 실측(사회 평가지 6/6 → 3/6 → 4/6): 붙임 칸이 매번 다른 꼴로 비켜 갔다.
test("'신문사명:'처럼 라벨 뒤에 명/란/칸이 붙어도 같은 칸이다", () => {
  const r = blankPastedMetadata("신문사명: [신문사명]\n언론사란: 한겨레\n\n붙일 자료: 기사 본문", { force: true });
  assert.match(r.content, /신문사명: \[직접 작성/);
  assert.match(r.content, /언론사란: \[직접 작성/);
});

test("대괄호만 씌운 자리표시는 빈칸이 아니다 — 값도 빈칸도 아닌 상태를 없앤다", () => {
  const r = blankPastedMetadata("제목: [기사 제목]\n\n붙일 자료: 기사 본문", { force: true });
  assert.match(r.content, /제목: \[직접 작성: 붙인 기사의 제목\]/);
  // 이미 제대로 된 빈칸은 건드리지 않는다
  const keep = blankPastedMetadata("제목: [직접 작성: 붙인 기사의 제목]\n\n붙일 자료: 기사 본문", { force: true });
  assert.equal(keep.blanked.length, 0);
});

test("서지를 한 줄에 몰아 쓴 꼴도 칸마다 한 줄로 펼친다", () => {
  const r = blankPastedMetadata("제목·보도 날짜·출처: 출력한 기사에 표시된 실제 값\n\n붙일 자료: 기사 본문", { force: true });
  assert.match(r.content, /제목: \[직접 작성/);
  assert.match(r.content, /보도 날짜: \[직접 작성/);
  assert.match(r.content, /출처: \[직접 작성/);
  // 쉼표·가운뎃점이 들어간 평범한 문장은 건드리지 않는다
  const keep = blankPastedMetadata("이 글은 노인 빈곤, 기초연금과 사각지대를 다룬다.\n\n붙일 자료: x", { force: true });
  assert.match(keep.content, /노인 빈곤, 기초연금과 사각지대/);
});

test("기사 위에 적으라고 시키는 붙일 자료 줄은 우리 문구로 바꾼다", () => {
  const bad = "붙일 자료: 위에 제목·보도 날짜·신문사명을 표시한 신문 기사 원문 전체.";
  const out = normalizeAttachmentSlot(bad, () => []).content;
  assert.match(out, /기사 위에 아무것도 쓰지 말 것/);
  assert.doesNotMatch(out, /표시한/);
});
