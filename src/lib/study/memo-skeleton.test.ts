import { test } from "node:test";
import assert from "node:assert/strict";
import { acronym, chipBank, cleanSkeleton, firstLetterHint, flowLine, readiness, sameKeyword, scoreWrite, segmentLine, skeletonLimits } from "./memo-skeleton.ts";

const MATERIAL = "대기압이 물을 빨대 안으로 민다. 밸브는 역류를 막고 펌프는 압력을 바꾼다. 2023년 폐플라스틱은 771만 톤이다.";

test("cleanSkeleton: 한 줄에 없거나 자료에 없는 핵심어·빈 칸을 거른다", () => {
  const r = cleanSkeleton(
    [
      { box: "실험1", line: "대기압이 물을 빨대 안으로 민다", keywords: ["대기압", "삼투압", "빨대", "대기압"] },
      { box: "구조", line: "밸브는 역류를 막는다", keywords: ["지어낸말"] },
      { box: "", line: "x", keywords: ["x"] },
      { box: "수치", line: "2023년 폐플라스틱은 771만 톤이다", keywords: ["2023년", "771만 톤", "폐플라스틱"] },
    ],
    MATERIAL,
    { boxes: 6, perBox: 2 }
  );
  assert.deepEqual(r.map((b) => b.box), ["실험1", "수치"]);
  assert.deepEqual(r[0].keywords, ["대기압", "빨대"]);
  assert.deepEqual(r[1].keywords, ["2023년", "771만 톤"]);
});

test("cleanSkeleton: 칸 수 상한", () => {
  const raw = ["대기압", "밸브", "펌프"].map((k) => ({ box: k, line: `${k}가 나온다`, keywords: [k] }));
  assert.equal(cleanSkeleton(raw, MATERIAL, { boxes: 2, perBox: 3 }).length, 2);
});

test("skeletonLimits: 짧게 쓰는 시험이면 줄인다", () => {
  assert.deepEqual(skeletonLimits("standard"), { boxes: 6, perBox: 3 });
  assert.deepEqual(skeletonLimits("standard", 700), { boxes: 4, perBox: 2 });
  assert.deepEqual(skeletonLimits("brief", 700), { boxes: 4, perBox: 2 });
});

test("두음·흐름·힌트", () => {
  assert.equal(acronym(["대기압", "밸브", "펌프"]), "대·밸·펌");
  assert.equal(flowLine([{ box: "A", line: "", keywords: [] }, { box: "B", line: "", keywords: [] }]), "A → B");
  assert.equal(firstLetterHint("대기압"), "대○○");
  assert.equal(firstLetterHint("물"), "물");
});

test("segmentLine: 핵심어 자리에서 자른다(순서·겹침)", () => {
  const segs = segmentLine("대기압이 물을 빨대 안으로 민다", ["빨대", "대기압"]);
  assert.deepEqual(segs.map((s) => [s.text, s.blank]), [
    ["대기압", 1],
    ["이 물을 ", undefined],
    ["빨대", 0],
    [" 안으로 민다", undefined],
  ]);
  assert.equal(segs.map((s) => s.text).join(""), "대기압이 물을 빨대 안으로 민다");
});

test("chipBank: 내 핵심어 + 다른 칸 오답, 같은 입력은 같은 결과", () => {
  const boxes = [
    { box: "a", line: "", keywords: ["대기압", "빨대"] },
    { box: "b", line: "", keywords: ["밸브", "역류"] },
    { box: "c", line: "", keywords: ["펌프"] },
  ];
  const bank = chipBank(boxes, 0, 2);
  assert.equal(bank.length, 4);
  for (const k of ["대기압", "빨대", "밸브", "역류"]) assert.ok(bank.includes(k));
  assert.deepEqual(chipBank(boxes, 0, 2), bank);
});

test("sameKeyword·scoreWrite·readiness", () => {
  assert.ok(sameKeyword(" 771만톤 ", "771만 톤"));
  assert.ok(!sameKeyword("", ""));
  const s = scoreWrite("대기압이 물을 민다", ["대기압", "빨대"]);
  assert.deepEqual(s, { hit: ["대기압"], miss: ["빨대"] });
  assert.equal(readiness([{ hit: 1, total: 2 }, { hit: 3, total: 3 }]), 80);
  assert.equal(readiness([]), 0);
});
