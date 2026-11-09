import { test } from "node:test";
import assert from "node:assert/strict";
import { classifySourceTier } from "./source-quality.ts";

test("레포트 판매·커뮤니티는 약한 출처, 나무위키 미러는 백과·위키", () => {
  // 실측(2026-10-24): 아래 출처가 모두 "일반"으로 매겨져 핵심 근거로 쓰였다.
  assert.equal(classifySourceTier("https://www.allreport.co.kr/search/detail.asp?pk=1"), "weak");
  assert.equal(classifySourceTier("https://docs.orbi.kr/attach/public/7514"), "weak");
  assert.equal(classifySourceTier("https://www.happycampus.com/report-doc/1/"), "weak");
  assert.equal(classifySourceTier("https://www.namu.moe/w/abc"), "reference");
  assert.equal(classifySourceTier("https://www.khan.co.kr/article/1"), classifySourceTier("https://www.khan.co.kr/article/2"));
});

test("멀쩡한 공공·언론·학술이 '일반'으로 떨어지지 않는다 (2026-11-10 전수 측정에서 69개 중 대부분)", () => {
  // 공공 — 학생 화면에 "일반 사이트"로 보이면 멀쩡한 근거를 못 믿게 된다
  assert.equal(classifySourceTier("https://www.korea.kr/briefing/pressReleaseView.do?newsId=1"), "official");
  assert.equal(classifySourceTier("https://institute.nps.or.kr/jsppage/research/1.jsp"), "official");
  assert.equal(classifySourceTier("https://archives.kdemo.or.kr/photo-archives/view/1"), "official");
  assert.equal(classifySourceTier("https://www.airkorea.or.kr/web/realSearch"), "official");
  assert.equal(classifySourceTier("https://contents.kocw.or.kr/document/1.pdf"), "official");
  assert.equal(classifySourceTier("https://onlinelibrary.wiley.com/doi/10.1111/abc"), "official");
  // 언론 — 전자신문은 전수에서 37회였다
  assert.equal(classifySourceTier("https://www.etnews.com/20260101000001"), "reliable");
  assert.equal(classifySourceTier("https://m.etnews.com/20260101000001"), "reliable");
  assert.equal(classifySourceTier("https://news.tf.co.kr/read/economy/1.htm"), "reliable");
  assert.equal(classifySourceTier("https://www.mt.co.kr/view/mtview.php?no=1"), "reliable");
  // 넓혀도 약한 출처·위키 판정은 그대로
  assert.equal(classifySourceTier("https://blog.naver.com/abc/1"), "weak");
  assert.equal(classifySourceTier("https://ko.wikipedia.org/wiki/abc"), "reference");
  assert.equal(classifySourceTier("https://www.scribd.com/document/1"), "general");
  // or.kr을 통째로 넣지 않았다 — 시민단체·사설 기관은 '일반'으로 남는다
  assert.equal(classifySourceTier("https://opennet.or.kr/12345"), "general");
});
