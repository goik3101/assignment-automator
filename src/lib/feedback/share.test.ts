import { test } from "node:test";
import assert from "node:assert/strict";
import { SHARE_MAX_CHARS, SHARE_TAG, buildShareMessage, isShareMessage, shouldAskShare, withShareTag } from "./share.ts";

test("과목·주제·추가 요청·칸 본문·출처를 한 글로 만든다", () => {
  const m = buildShareMessage({
    subject: "국어",
    topic: "독서 감상문",
    instructions: "책은 아몬드로 할게요",
    cards: [{ label: "감상문", text: "본문입니다.[1]", sources: [{ n: 1, title: "제목", url: "https://example.com" }] }],
  });
  assert.match(m, /과목: 국어/);
  assert.match(m, /학생이 입력한 추가 요청: 책은 아몬드로 할게요/);
  assert.match(m, /===== 감상문 =====\n본문입니다\.\[1\]/);
  assert.match(m, /\[1\] 제목 <https:\/\/example\.com>/);
});

test("추가 요청이 없으면 (없음)으로 쓰고 이메일 같은 계정 정보 칸은 만들지 않는다", () => {
  const m = buildShareMessage({ cards: [{ label: "원고", text: "글" }] });
  assert.match(m, /추가 요청: \(없음\)/);
  assert.ok(!/이메일|user_id|계정/.test(m));
});

test("너무 길면 상한에서 자르고 생략 표시를 붙인다", () => {
  const m = buildShareMessage({ cards: [{ label: "원고", text: "가".repeat(SHARE_MAX_CHARS + 500) }] });
  assert.ok(m.length <= SHARE_MAX_CHARS + 1);
  assert.ok(m.endsWith("…(이하 생략)"));
});

test("태그는 맨 앞에 한 번만 붙는다(멱등)", () => {
  const once = withShareTag("본문");
  assert.equal(withShareTag(once), once);
  assert.ok(isShareMessage(once));
  assert.ok(once.startsWith(SHARE_TAG));
  assert.ok(!isShareMessage("일반 피드백"));
});

test("두 번 닫았거나 이미 보냈거나 이 결과물에서 이미 물었으면 다시 묻지 않는다", () => {
  assert.equal(shouldAskShare({ off: false, dismissed: 0, seenThisResult: false }), true);
  assert.equal(shouldAskShare({ off: false, dismissed: 1, seenThisResult: false }), true);
  assert.equal(shouldAskShare({ off: false, dismissed: 2, seenThisResult: false }), false);
  assert.equal(shouldAskShare({ off: true, dismissed: 0, seenThisResult: false }), false);
  assert.equal(shouldAskShare({ off: false, dismissed: 0, seenThisResult: true }), false);
});
