import { test } from "node:test";
import assert from "node:assert/strict";
import { readBeatTable, beatsPerMeasure, recoverBeatTable, checkRhythm, beatTableLine } from "./rhythm-check.ts";

const NOTICE = "음표|길이|읽기|음표|길이|읽기\n___|2박|큐-울(쿵)|___|1박|배\n___|1박|사과|___|1박|치키치키\n___|1박|꿀딱기|___|1박|오징어\n___|1박|깡총|___|1박|폴짝\n___|2박|꿀꺽|___|1박|오렌지\n___|1박|?|___|1박|?";
const REQ = ["4분의 4박자", "24마디", "음표의 읽는 방법으로 표현"];

test("읽기 표에서 (낱말, 박)만 뽑는다 — 물음표 칸·빈칸은 버린다 (2026-11-23 음악)", () => {
  const t = readBeatTable([NOTICE]);
  assert.equal(t.length, 10);
  assert.deepEqual(t.find((e) => e.word === "큐-울(쿵)"), { word: "큐-울(쿵)", beats: 2 });
  assert.deepEqual(t.find((e) => e.word === "배"), { word: "배", beats: 1 });
});
test("평가표·배점표 줄은 읽지 않는다(프롬프트로 새지 않음)", () => {
  const rubric = "평가요소|채점 기준|배점\n일본 전통 가옥 구조 명칭 제시하기|4가지를 모두 정확하게 제시함.|4점\n|3가지를 정확하게 제시함.|3점\n(20) | 입력값, 연산자 | 5개 이상 활용 20\n| 4개 활용 15";
  assert.deepEqual(readBeatTable([rubric]), []);
});
test("박자 읽기: 4분의 4, 4/4, 3/4만 인정하고 8분의 6은 모른다", () => {
  assert.equal(beatsPerMeasure(["4분의 4박자로 작품을 만들 것"]), 4);
  assert.equal(beatsPerMeasure(["3/4박자"]), 3);
  assert.equal(beatsPerMeasure(["8분의 6박자"]), null);
});
test("분석이 표를 자료로 못 넘겼으면 한 줄로 되찾고, 이미 있거나 리듬 과제가 아니면 null", () => {
  const line = recoverBeatTable(["제시 가사: …"], NOTICE, REQ);
  assert.ok(line && line.includes("2박: 큐-울(쿵), 꿀꺽") && line.includes("정확히 4박"));
  assert.equal(recoverBeatTable(["리듬 표:\n" + NOTICE], NOTICE, REQ), null);
  assert.equal(recoverBeatTable([], NOTICE, ["보고서를 쓴다"]), null);
});
test("마디의 박 합이 틀린 줄과 세 번 이상 되풀이된 조합을 잡는다", () => {
  const e = readBeatTable([NOTICE]);
  const content = [
    "기본 규칙: 큐-울(쿵)·꿀꺽은 2박, 나머지(배·사과·치키치키)는 1박",
    "1마디: (2박)큐-울(쿵) | (1박)사과 | (1박)치키치키",
    "2마디: 큐-울(쿵) 사과 치키치키 꿀딱기",
    "3마디: (1박)꿀딱기 | (1박)오징어 | (1박)깡총 | (1박)폴짝",
    "4마디: (1박)꿀딱기 | (1박)오징어 | (1박)깡총 | (1박)폴짝",
    "5마디: (1박)꿀딱기 | (1박)오징어 | (1박)깡총 | (1박)폴짝",
  ].join("\n");
  const r = checkRhythm(content, e, 4);
  assert.equal(r.measures.length, 5);
  assert.deepEqual(r.wrongSum.map((m) => [m.n, m.beats]), [[2, 5]]);
  assert.equal(r.repeated.length, 1);
});
test("표 낱말을 하나도 안 쓰면(자기 표기를 지어 낸 경우) 그렇게 알린다", () => {
  const e = readBeatTable([NOTICE]);
  const r = checkRhythm("1: (타 타 타 타) 책상 위에\n2: (타 티카 타 타) 한숨 쉬며", e, 4);
  assert.equal(r.noTableWords, true);
  assert.ok(beatTableLine(e, 4).includes("1박:"));
});

import { fixRhythm } from "./rhythm-check.ts";
test("fixRhythm: 박 합이 틀린 마디를 코드가 맞추고, 줄의 나머지·구분 기호·(N박) 표기는 그대로 둔다", () => {
  const e = readBeatTable([NOTICE]);
  const content = [
    "기본 규칙: 큐-울(쿵)·꿀꺽은 2박, 나머지는 1박",
    "1마디: (2박)큐-울(쿵) | (1박)사과 | (1박)치키치키 | (1박)꿀딱기 — 책상 위에 성적표",
    "2. 한숨 쉬며 걱정 또 — 큐-울(쿵) 배",
    "3마디: 사과 / 치키치키 / 꿀딱기 / 오징어",
  ].join("\n");
  const r = fixRhythm(content, e, 4);
  const after = checkRhythm(r.content, e, 4);
  assert.equal(after.wrongSum.length, 0);
  assert.equal(r.fixedSums, 2);
  assert.match(r.content, /^기본 규칙: 큐-울\(쿵\)·꿀꺽은 2박/);
  assert.match(r.content, /1마디: \(2박\)큐-울\(쿵\) \| \(1박\)사과 \| \(1박\)치키치키 — 책상 위에 성적표/);
  assert.match(r.content, /3마디: 사과 \/ 치키치키 \/ 꿀딱기 \/ 오징어$/);
  assert.equal(fixRhythm(r.content, e, 4).content, r.content); // 멱등
});
test("fixRhythm: 세 번째부터 같은 조합이면 같은 박의 다른 낱말로 돌린다(박 합 유지)", () => {
  const e = readBeatTable([NOTICE]);
  const row = "마디: 사과 / 치키치키 / 꿀딱기 / 오징어";
  const content = [1, 2, 3, 4, 5].map((n) => row.replace("마디", `${n}마디`)).join("\n");
  const r = fixRhythm(content, e, 4);
  const rep = checkRhythm(r.content, e, 4);
  assert.equal(rep.wrongSum.length, 0);
  assert.equal(rep.repeated.length, 0);
  assert.ok(r.varied >= 3);
  assert.equal(fixRhythm(r.content, e, 4).content, r.content);
});
test("fixRhythm: 리듬 줄이 없으면 글을 그대로 둔다", () => {
  const e = readBeatTable([NOTICE]);
  const t = "첫 문단이다.\n둘째 문단이다.";
  assert.deepEqual(fixRhythm(t, e, 4), { content: t, fixedSums: 0, varied: 0 });
});

test("모델이 큐-울(쿵)을 큐-울로 줄여 써도 2박으로 읽고, 되찾은 줄은 마디 형식을 알려 준다", () => {
  const e = readBeatTable([NOTICE]);
  const r = checkRhythm("1마디 | 큐-울 배 배 | 책상 위에 성적표\n2마디 | 큐-울 사과 치키치키 | 한숨", e, 4);
  assert.deepEqual(r.measures.map((m) => m.beats), [4, 4]);
  assert.match(beatTableLine(e, 4), /N마디 \| 읽기 낱말들/);
});

test("마디를 한 줄에 이어 써도(\"1마디 | … 2마디 | …\") 마디마다 합을 세고 고친다", () => {
  const e = readBeatTable([NOTICE]);
  const content = "1마디 | 큐-울(쿵) 배 사과 | 책상 위에 성적표 2마디 | 꿀꺽 배 배 | 한숨 쉬며 걱정 또 3마디 | 배 사과 큐-울(쿵) | 숫자 앞에 멈췄어";
  const rep = checkRhythm(content, e, 4);
  assert.deepEqual(rep.measures.map((m) => [m.n, m.beats]), [[1, 4], [2, 4], [3, 4]]);
  const bad = content.replace("꿀꺽 배 배", "꿀꺽 배 배 사과 오징어");
  assert.deepEqual(checkRhythm(bad, e, 4).wrongSum.length, 1);
  const r = fixRhythm(bad, e, 4);
  assert.equal(checkRhythm(r.content, e, 4).wrongSum.length, 0);
  assert.match(r.content, /1마디 \| 큐-울\(쿵\) 배 사과 \| 책상 위에 성적표 2마디 \| 꿀꺽 배 배 \| 한숨 쉬며 걱정 또 3마디/);
  assert.equal(fixRhythm(r.content, e, 4).content, r.content);
});

test("바로 앞 마디와 같은 조합도 바꾼다(\"같은 리듬이 계속 반복\")", () => {
  const e = readBeatTable([NOTICE]);
  const content = "1마디 | 사과 배 치키치키 오징어 | a\n2마디 | 사과 배 치키치키 오징어 | b\n3마디 | 큐-울(쿵) 배 배 | c";
  const r = fixRhythm(content, e, 4);
  const m = checkRhythm(r.content, e, 4).measures;
  assert.notEqual(m[0].words.join(), m[1].words.join());
  assert.equal(m.every((x) => x.beats === 4), true);
  assert.equal(fixRhythm(r.content, e, 4).content, r.content);
});
