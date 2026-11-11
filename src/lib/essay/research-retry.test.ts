import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeAskingPermission } from "./research-retry.ts";

test("사실 대신 허락을 묻는 답을 가려낸다 (2026-11-12 실측)", () => {
  // 실제로 받은 답(검색은 페이지 26곳을 열었는데 사실 0개로 읽혔다)
  const real =
    "검색을 시작해도 될까요? (자료는 한 번의 검색으로 한국어 기사 2건(뉴스케이프 2026-04-09, 이데일리 2026-01-01)을 포함해 신뢰도 높은 서로 다른 페이지 3곳 이상에서 확인한 사실 10–14개를 JSON 배열 형식으로 제공합니다.)";
  assert.equal(looksLikeAskingPermission(real), true);
  assert.equal(looksLikeAskingPermission("원하시면 지금 검색해 드릴까요?"), true);
  assert.equal(looksLikeAskingPermission("주제를 알려 주시면 조사하겠습니다."), true);
});

test("JSON을 내려던 답은 형식 실수로 보지 않는다", () => {
  assert.equal(looksLikeAskingPermission('[{"fact":"1945년 광복","url":"https://x.kr","title":"기록원"}]'), false);
  assert.equal(looksLikeAskingPermission('```json\n[{"url":"https://x.kr"}]\n```'), false);
  // 코드펜스가 붙었어도 "url" 키가 보이면 파싱 문제다 — 다시 묻는 길이 아니다.
  assert.equal(looksLikeAskingPermission('설명 조금\n[{"fact":"a","url":"https://x"}]'), false);
});

test("빈 답과 아주 긴 답은 다시 묻지 않는다", () => {
  assert.equal(looksLikeAskingPermission(""), false);
  assert.equal(looksLikeAskingPermission("할까요 " + "가".repeat(1300)), false);
});
