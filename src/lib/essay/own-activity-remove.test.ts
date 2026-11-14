import test from "node:test";
import assert from "node:assert/strict";
import { removeOwnActivitySentences } from "./own-activity.ts";

test("사진을 준비해 첨부했다·스마트폰으로 검색했다는 지어낸 문장을 지운다(역사-03·사회-04)", () => {
  const t = "금동대향로는 백제의 대표 유물이다.[1] 각 유물마다 논술용 사진과 제작용 사진을 한 장씩 따로 준비해 첨부했다. 향로는 산 모양 뚜껑과 용이 받친 몸체가 특징이며 백제의 도교적 세계관을 보여 준다.[1]";
  const r = removeOwnActivitySentences(t);
  assert.equal(r.removed.length, 1);
  assert.ok(!/첨부했다/.test(r.content));
  assert.match(r.content, /금동대향로는 백제의 대표 유물이다\.\[1\]/);
  assert.match(r.content, /산 모양 뚜껑/);
});

test("가상 회고록의 방문·인터뷰 문장과 각주 달린 사실은 건드리지 않는다", () => {
  const t = "나는 1944년 봄 마을을 방문한 관리를 만났다. 인터뷰에서 이웃이 들려준 이야기를 기억한다. 학교 운동장에서 근로 동원이 이루어졌다.[2]";
  const r = removeOwnActivitySentences(t);
  assert.equal(r.content, t);
  assert.equal(r.removed.length, 0);
});

test("지우면 글이 40자 미만이 되면 지우지 않는다", () => {
  const t = "사진을 준비해 첨부했다.";
  assert.equal(removeOwnActivitySentences(t).content, t);
});
