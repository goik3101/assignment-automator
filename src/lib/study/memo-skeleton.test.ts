import { test } from "node:test";
import assert from "node:assert/strict";
import { acronym, chipBank, cleanSkeleton, dedupeKeywords, markKeywords, firstLetterHint, mnemonicOf, flowLine, quizIndexes, readiness, sameKeyword, scoreWrite, segmentLine, skeletonLimits } from "./memo-skeleton.ts";

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
  // 칸 이름·한 줄이 비면 버리지만, 핵심어가 다 탈락한 칸("구조")은 순서에 남는다(핵심어만 빈 배열).
  assert.deepEqual(r.map((b) => b.box), ["실험1", "구조", "수치"]);
  assert.deepEqual(r[1].keywords, []);
  assert.deepEqual(r[0].keywords, ["대기압", "빨대"]);
  assert.deepEqual(r[2].keywords, ["2023년", "771만 톤"]);
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

test("숫자 핵심어: 수치·소수점이 같은 답으로 뭉개지지 않고 힌트가 서로 구별된다", () => {
  assert.ok(!sameKeyword("35%", "3.5%"));
  assert.ok(!sameKeyword("23", "2-3"));
  assert.deepEqual(scoreWrite("35%입니다", ["3.5%"]), { hit: [], miss: ["3.5%"] });
  assert.equal(firstLetterHint("2022년"), "2022○");
  assert.equal(acronym(["2022년", "2023년", "대기압"]), "2022·2023·대");
});

test("cleanSkeleton: 줄에 글자 그대로 없는 핵심어와 한 글자 낱말은 거른다", () => {
  const r = cleanSkeleton(
    [{ box: "A", line: "용기안의압력이 높아진다", keywords: ["용기 안의 압력", "물", "압력"] }],
    "용기안의압력이 높아진다 물",
    { boxes: 4, perBox: 3 }
  );
  assert.deepEqual(r[0].keywords, ["압력"]);
});

test("cleanSkeleton: 핵심어가 하나도 안 남은 칸(결론)도 순서에는 남기고, 빈칸 문제만 건너뛴다", () => {
  const r = cleanSkeleton(
    [
      { box: "자료조사", line: "2023년 폐플라스틱은 771만 톤이다", keywords: ["771만 톤"] },
      { box: "결론", line: "생산부터 폐기까지 함께 바꿔야 한다", keywords: ["지어낸 말"] },
    ],
    MATERIAL,
    { boxes: 6, perBox: 3 }
  );
  assert.deepEqual(r.map((b) => b.box), ["자료조사", "결론"]);
  assert.deepEqual(r[1].keywords, []);
  assert.deepEqual(quizIndexes(r), [0]);
  assert.equal(flowLine(r), "자료조사 → 결론");
});

test("skeletonLimits: 이름 있는 항목으로 된 결과물은 칸을 2배 허용하고 핵심어 수는 그대로", () => {
  assert.deepEqual(skeletonLimits("standard", undefined, true), { boxes: 12, perBox: 3 });
  assert.deepEqual(skeletonLimits("standard", undefined, false), { boxes: 6, perBox: 3 });
  // 짧게 손으로 쓰는 시험이면 항목 단위여도 늘리지 않는다
  assert.deepEqual(skeletonLimits("standard", 700, true), { boxes: 4, perBox: 2 });
});

test("첫 글자 쓰기 채점: 핵심어가 들어 있으면 맞다(조사를 붙여도), 엉뚱하게 긴 글은 아니다", () => {
  assert.ok(sameKeyword("대기압이", "대기압"));
  assert.ok(sameKeyword("771만 톤이다", "771만 톤"));
  assert.ok(sameKeyword("대기 압", "대기압"));
  assert.ok(!sameKeyword("공기압", "대기압"));
  assert.ok(!sameKeyword("대기압 차이로 물이 올라가고 빨대가 굵어지며", "대기압")); // 문장을 통째로 쓴 것은 단어 맞히기가 아니다
  assert.ok(!sameKeyword("", "대기압"));
});

test("cleanSkeleton: 영어 화면은 자료(한국어)에 없는 영어 핵심어도 줄 안에 있으면 살린다", () => {
  const ko = "인터넷 실명제는 본인 확인을 요구한다.";
  const raw = [{ box: "목적", line: "The real-name system requires ID checks since July 2007", keywords: ["real-name system", "July 2007"] }];
  assert.deepEqual(cleanSkeleton(raw, ko, { boxes: 6, perBox: 3 })[0].keywords, []); // 한국어 화면 규칙으로는 버려진다
  assert.deepEqual(cleanSkeleton(raw, ko, { boxes: 6, perBox: 3 }, { checkMaterial: false })[0].keywords, ["real-name system", "July 2007"]);
});

test("dedupeKeywords: 여러 칸에 나오는 낱말은 처음 칸에만, 칸의 절반 넘게 나오면 주제어라 뺀다", () => {
  const boxes = [
    { line: "A 헌법재판소 실명제", keywords: ["헌법재판소", "실명제"] },
    { line: "B 실명제 2007년", keywords: ["실명제", "2007년"] },
    { line: "C 헌법재판소 실명제", keywords: ["헌법재판소", "실명제"] },
    { line: "D 실명제", keywords: ["실명제"] },
    { line: "E 실명제", keywords: [] },
  ];
  // 실명제는 5칸 중 5칸(≥3) → 주제어라 모두 뺀다. 헌법재판소는 2칸 → 처음 칸(A)에만.
  assert.deepEqual(dedupeKeywords(boxes), [["헌법재판소"], ["2007년"], [], [], []]);
  // 칸이 적으면(3개 이하) 주제어 판정은 하지 않고 중복만 정리한다
  assert.deepEqual(dedupeKeywords([{ line: "가 실명제", keywords: ["실명제"] }, { line: "나 실명제", keywords: ["실명제"] }]), [["실명제"], []]);
});

test("mnemonicOf: 숫자로 시작하는 핵심어만 있으면 두음을 만들지 않는다", () => {
  assert.equal(mnemonicOf(["1964년", "1965년"]), null);
  assert.equal(mnemonicOf(["대기압", "밸브", "1963년"]), "대·밸");
  assert.equal(mnemonicOf(["대기압"]), null);
});

test("markKeywords: 「」로 표시한 말과 연도·수치·조문, 개념 목록의 말을 모으고 표시는 줄에서 걷어 낸다", () => {
  const r = markKeywords("「몽고메리개선협회」 지도자로 1955년 「버스 보이콧」을 이끌었고, 법 제44조의5와 약 771만 톤이 근거다.", [], 5);
  assert.equal(r.line, "몽고메리개선협회 지도자로 1955년 버스 보이콧을 이끌었고, 법 제44조의5와 약 771만 톤이 근거다.");
  assert.deepEqual(r.keywords, ["몽고메리개선협회", "1955년", "버스 보이콧", "제44조의5", "771만 톤"]);
  // 개념 목록의 말은 표시가 없어도 줄에 있으면 핵심어
  assert.deepEqual(markKeywords("압력 차이로 대기압이 물을 민다.", ["대기압"], 3).keywords, ["대기압"]);
  // 칸당 개수 상한
  assert.deepEqual(markKeywords("2001년, 2002년, 2003년, 2004년", [], 2).keywords, ["2001년", "2002년"]);
});

test("markKeywords: 문장째 표시·한 글자 표시·짝이 안 맞는 표시는 버리고, 표시가 없으면 숫자·개념어만", () => {
  assert.deepEqual(markKeywords("「킹은 1955년에 몽고메리에서 버스 보이콧을 이끌었다고 알려져 있다」", [], 3).keywords, ["1955년"]);
  assert.deepEqual(markKeywords("그는 「물」을 마셨다.", [], 3).keywords, []);
  assert.equal(markKeywords("「열린 표시만 있다", [], 3).line, "열린 표시만 있다");
  assert.deepEqual(markKeywords("설명하는 칸이라 외울 말이 없다.", [], 3), { line: "설명하는 칸이라 외울 말이 없다.", keywords: [] });
  // 영어 줄도 같은 방식이다
  assert.deepEqual(markKeywords("The 「Constitutional Court」 ruled in 2010년.", [], 3).keywords, ["Constitutional Court", "2010년"]);
  // 긴 이름이 짧은 이름을 품으면 짧은 것은 뺀다
  assert.deepEqual(markKeywords("「몽고메리 버스 보이콧」 곧 「버스 보이콧」", [], 3).keywords, ["몽고메리 버스 보이콧"]);
});
