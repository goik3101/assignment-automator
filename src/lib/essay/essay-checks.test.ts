import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildNewspaperBlock,
  classifyRequiredItem,
  inferDeliverableForm,
  splitProductionNotes,
  stripMetaNoteLines,
  stripModelReferenceBlock,
  stripWorkMarkers,
} from "./deliverable.ts";
import { describePair, findRepeatedStatements, similarity } from "./repetition.ts";
import { checkClaims, extractCheckTokens, pageSupports } from "./claim-check.ts";

// ── 산출물 형식 ────────────────────────────────────────────
test("라벨이 신문이면 신문 산출물, 자료 수집은 아니다", () => {
  assert.equal(inferDeliverableForm({ label: "신문 제작", description: "수집한 자료로 신문을 제작함" }), "newspaper");
  assert.equal(inferDeliverableForm({ label: "자료 수집", description: "신문 제작에 쓸 인물 자료를 수집함" }), null);
  assert.equal(inferDeliverableForm({ label: "산출물", description: "신문 형식으로 정리한다" }), "newspaper");
  assert.equal(inferDeliverableForm({ label: "독서 감상문", description: "책을 읽고 쓴다" }), null);
  assert.equal(inferDeliverableForm({ label: "저널", description: "일지를 쓴다" }), null);
});

test("필수 항목을 내용/시각 자료/소감으로 가른다", () => {
  assert.equal(classifyRequiredItem("인물의 생애 배경"), "content");
  assert.equal(classifyRequiredItem("시각 자료(그림·도표 등) 활용"), "visual");
  assert.equal(classifyRequiredItem("제작 과정에서 인상 깊었던 점 및 이유 서술"), "reflection");
  assert.equal(classifyRequiredItem("교훈 명료하게 전달"), "reflection");
});

test("신문 지시문에 항목·제작 참고·초안 표기·자료 수집 반복 금지가 들어간다", () => {
  const block = buildNewspaperBlock({
    label: "신문 제작",
    requiredItems: ["인물의 생애 배경", "주요 활동", "시각 자료(그림·도표 등) 활용", "교훈 명료하게 전달"],
    materialLabels: ["자료 수집"],
  });
  assert.match(block, /인물의 생애 배경 \/ 주요 활동/);
  assert.match(block, /### 제작 참고/);
  assert.match(block, /학생 감상 초안/);
  assert.match(block, /"자료 수집" 단계에 쓴 문장을 그대로 다시 쓰지 말 것/);
});

test("제작 참고 블록을 본문에서 떼어낸다", () => {
  const src = "**〈신문〉**\n### 머리기사\n내용이다.\n\n### 제작 참고 (제출용 아님)\n- 사진: 어디\n- 그림: 저기\n\n### 제작 후기\n(학생 감상 초안 — x)\n후기다.";
  const { body, notes } = splitProductionNotes(src);
  assert.ok(!body.includes("제작 참고"));
  assert.ok(body.includes("### 제작 후기"));
  assert.ok(body.includes("내용이다."));
  assert.equal(notes, "- 사진: 어디\n- 그림: 저기");
  assert.deepEqual(splitProductionNotes("그냥 글"), { body: "그냥 글", notes: null });
});

test("모델이 쓴 참고 각주 목록은 지우고 본문은 건드리지 않는다", () => {
  const src = "### 교훈\n목소리가 힘이 된다.[2]\n\n참고 각주\n[1] Hachette — I Am Malala[1].\n[2] Malala Fund[2].";
  const r = stripModelReferenceBlock(src);
  assert.equal(r.stripped, true);
  assert.equal(r.content, "### 교훈\n목소리가 힘이 된다.[2]");
  const keep = "### 참고\n이 항목은 참고 자료를 설명한다.\n[1] 같은 줄은 본문이다.";
  assert.equal(stripModelReferenceBlock(keep).stripped, false);
  assert.equal(stripModelReferenceBlock("끝\n\n출처:\n").stripped, false);
});

test("실제로 나온 제목 없는 참고 목록·끝맺음 설명·번호 빠진 줄도 지운다", () => {
  const src =
    "### 제작 후기\n(학생 감상 초안 — 본인 생각에 맞게 고쳐 쓰세요)\n- 교훈: 목소리를 내는 일이 변화를 만든다.\n\n" +
    "[1] 말랄라가 탈레반의 공격 후에도 교육권 옹호 활동을 지속한 사실[1].\n" +
    "[2] 말랄라와 아버지가 2013년 공동 설립한 Malala Fund 정보[2].\n" +
    "[3] 출생일(1997년 7월 12일)[1].\n" +
    " 말랄라 펀드의 현지 사업·보고서에 관한 조직 자료[7].\n\n" +
    "(위 내용은 각 문장 끝의 각주 번호로 연결된 웹 자료를 근거로 작성되었음.)";
  const r = stripModelReferenceBlock(src);
  assert.equal(r.stripped, true);
  assert.equal(r.content, "### 제작 후기\n(학생 감상 초안 — 본인 생각에 맞게 고쳐 쓰세요)\n- 교훈: 목소리를 내는 일이 변화를 만든다.");
  // 본문의 불릿 목록(번호 대괄호 아님)은 제목이 없으면 건드리지 않는다
  const bullets = "### 주요 활동\n- 2013년 펀드를 만들었다.[2]\n- 2014년 상을 받았다.[3]\n- 2015년 연설을 했다.[4]";
  assert.equal(stripModelReferenceBlock(bullets).stripped, false);
  // 끝맺음 설명만 있어도 지운다
  assert.equal(stripModelReferenceBlock("끝문장이다.[1]\n\n(위 내용은 각주로 연결된 자료를 근거로 작성했다.)").content, "끝문장이다.[1]");
});

test("(해석) 작업 표기를 지운다", () => {
  assert.equal(stripWorkMarkers("- (해석) 영향이 크다.[1]\n(해석) 또 다른 문장."), "- 영향이 크다.[1]\n또 다른 문장.");
});

// ── 반복 ─────────────────────────────────────────────────
test("거의 같은 문장은 높은 유사도, 다른 문장은 낮은 유사도", () => {
  assert.ok(similarity("2014년 카일라쉬 사티아르티와 공동으로 노벨평화상을 수상했다.[5]", "2014년 카일라쉬 사티아르티와 공동으로 노벨평화상을 수상했다.") > 0.95);
  assert.ok(similarity("1997년 파키스탄 스와트 계곡에서 태어났다.", "탈레반의 총격으로 중상을 입고 영국에서 치료받았다.") < 0.4);
});

test("단계·항목을 가로지르는 반복 문장 쌍을 찾는다(같은 항목 안은 제외)", () => {
  const material = "### 주요 활동\n- 2009년 BBC 우르두 사이트에 필명으로 블로그를 연속 기고해 일상을 기록했다.[3]\n- 2013년 말랄라 펀드를 설립해 소녀 교육 권리 옹호를 전개했다.[2]";
  const paper = "### 활동\n2009년 BBC 우르두 사이트에 필명으로 블로그를 연속 기고해 일상을 기록했다.[3]\n### 후기\n쓰면서 문장의 힘을 새삼 느꼈다고 정리하고 싶다.";
  const pairs = findRepeatedStatements([
    { label: "자료 수집", content: material },
    { label: "신문 제작", content: paper },
  ]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].a.label, "자료 수집");
  assert.equal(pairs[0].b.label, "신문 제작");
  assert.match(describePair(pairs[0]), /자료 수집 > 주요 활동/);
  const same = findRepeatedStatements([{ label: "A", content: "### 가\n같은 문장이 같은 항목 안에 두 번 나온다고 해보자.\n같은 문장이 같은 항목 안에 두 번 나온다고 해보자." }]);
  assert.equal(same.length, 0);
});

// ── 근거 확인 ─────────────────────────────────────────────
test("연도·큰 수·영문 고유명을 표지로 뽑는다", () => {
  const t = extractCheckTokens("2009년 BBC 우르두 사이트에 필명 'Gul Makai'로 연재했고 2,000명이 읽었다.[3]");
  assert.deepEqual(t.numbers.sort(), ["2000", "2009"]);
  assert.ok(t.names.includes("BBC"));
  assert.ok(t.names.includes("Gul Makai"));
  assert.deepEqual(extractCheckTokens("그녀는 용기 있는 사람이었다."), { numbers: [], names: [] });
});

const LONG = (s: string) => s + " filler".repeat(60);

test("페이지에 표지가 있으면 통과, 숫자가 없으면 불통", () => {
  assert.equal(pageSupports({ numbers: ["1997"], names: [] }, LONG("Malala was born in 1997 in Mingora")), true);
  assert.equal(pageSupports({ numbers: ["1997"], names: [] }, LONG("Malala Fund was founded in 2013")), false);
  assert.equal(pageSupports({ numbers: [], names: ["Gul Makai", "Urdu"] }, LONG("the gul makai diary on BBC")), true);
});

test("인용한 페이지가 뒷받침 못 하면 다른 출처로 고치고, 어디에도 없으면 각주를 지운다", () => {
  const pages = new Map<number, string | null>([
    [1, LONG("Hachette book page I Am Malala published 2013")],
    [2, LONG("About Malala Fund founded in 2013 to champion education")],
    [3, LONG("Malala Yousafzai born 12 July 1997 in Mingora. In 2009 she wrote for the BBC")],
  ]);
  const text = "- 1997년 7월 12일 밍골라에서 태어났다.[2]\n- 2009년 BBC에 블로그를 썼다.[3]\n- 2031년에 일어난 일이다.[1]\n- 용기 있는 사람이다.[2]";
  const r = checkClaims(text, pages, (n) => (n === 3 ? 1 : 0));
  const by = (s: string) => r.findings.find((f) => f.text.includes(s))!;
  assert.equal(by("밍골라").status, "repointed");
  assert.deepEqual(by("밍골라").to, [3]);
  assert.equal(by("BBC").status, "supported");
  assert.equal(by("2031").status, "unsupported");
  assert.equal(by("용기").status, "unchecked");
  assert.equal(r.content, "- 1997년 7월 12일 밍골라에서 태어났다.[3]\n- 2009년 BBC에 블로그를 썼다.[3]\n- 2031년에 일어난 일이다.\n- 용기 있는 사람이다.[2]");
});

test("읽지 못한 페이지는 각주를 두고 확인 불가로만 알린다", () => {
  const pages = new Map<number, string | null>([[1, null]]);
  const r = checkClaims("2014년에 상을 받았다.[1]", pages);
  assert.equal(r.findings[0].status, "unverified");
  assert.equal(r.content, "2014년에 상을 받았다.[1]");
});

test("글 속 작업 설명 괄호 줄만 지운다", () => {
  const src = ["| 2014 | 노벨 평화상 |", "", "(연도와 사건은 공개된 출처로 확인된 사실만 기재했다[2].)", "", "### 제작 후기", "(학생 감상 초안 — 본인 생각에 맞게 고쳐 쓰세요)", "(박수)", "후기다."].join("\n");
  const r = stripMetaNoteLines(src);
  assert.equal(r.removed, 1);
  assert.ok(!r.content.includes("기재했다"));
  assert.ok(r.content.includes("(학생 감상 초안") && r.content.includes("(박수)"));
  assert.equal(stripMetaNoteLines("그냥 글이다.").removed, 0);
});

test("모델이 붙인 주석 머리말 줄도 지운다", () => {
  const NL = String.fromCharCode(10);
  const src = ["본문이다.[1]", "(책 속 인상 깊은 구절 — 직접 인용 검증)", "(참고: 위의 책 서지와 인용구는 확인한 내용을 반영해 표기했습니다)[2].", "(웃으며) 안녕하세요."].join(NL);
  const r = stripMetaNoteLines(src);
  assert.equal(r.removed, 2);
  assert.equal(r.content, ["본문이다.[1]", "(웃으며) 안녕하세요."].join(NL));
});
