import test from "node:test";
import assert from "node:assert/strict";
import { fillPlaceholderSourceLine } from "./source-line.ts";

const SRC = [
  { n: 1, title: "우리역사넷 - 세종", url: "https://contents.history.go.kr/a" },
  { n: 2, title: "한국민족문화대백과사전 - 세종", url: "https://encykorea.aks.ac.kr/b" },
  { n: 3, title: "쓰이지 않은 출처", url: "https://example.com/c" },
];

test("값 없는 출처 줄을 인용된 확인 출처로 바꾼다(역사-02)", () => {
  const t = "세종은 왕이었다.[1] 집현전을 두었다.[2]\n\n자료 출처: [1] 제목·저자(또는 출처 URL) 미기재; [2] 제목·저자(또는 출처 URL) 미기재.";
  const r = fillPlaceholderSourceLine(t, SRC);
  assert.equal(r.replaced, true);
  assert.match(r.content, /자료 출처:\n- 우리역사넷 - 세종: https:\/\/contents\.history\.go\.kr\/a\n- 한국민족문화대백과사전 - 세종: https:\/\/encykorea\.aks\.ac\.kr\/b$/);
  assert.ok(!/미기재/.test(r.content));
  assert.ok(!/example\.com/.test(r.content));
});

test("인용된 출처가 없으면 그 줄을 지운다", () => {
  const r = fillPlaceholderSourceLine("본문이다.\n\n출처: 미기재", SRC);
  assert.equal(r.content, "본문이다.");
});

test("정상적으로 채워진 출처 줄과 본문은 그대로 둔다", () => {
  const t = "본문이다.[1]\n\n자료 출처: 우리역사넷, 세종 — https://contents.history.go.kr/a";
  assert.equal(fillPlaceholderSourceLine(t, SRC).replaced, false);
});
