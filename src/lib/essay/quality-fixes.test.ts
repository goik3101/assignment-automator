// 2026-10-21 글 품질·출처 점검에서 고친 순수 함수들. 실측 사례(gb_frz 8건)를 그대로 옮긴 입력을 쓴다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSourceListSection, fixJosaAfterTitle, isFinalReportForm, isResearchMaterialStep, isSourceListItem, reduceReportedSpeech, stripInlineUrls, stripMetaNoteLines, stripWorkNotes } from "./deliverable.ts";
import { stripOpinionCitations } from "./opinion-citations.ts";
import { buildFacts, parseBookResearch, parseFactJson } from "./research-notes.ts";
import { buildFormRulesBlock, inferFormKinds } from "./form-rules.ts";
import { lengthRoleOf } from "./length-plan.ts";
import { promptRuleScope } from "./prompt-scope.ts";

function withEnv(key: string, value: string | undefined, fn: () => void) {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}

test("괄호 하나가 빠진 조사 JSON도 사실을 읽는다(실측: 사실 0개 → 기존 경로 폴백)", () => {
  const broken =
    '[{"url":"https://a.org/x","title":"UNEP","facts":["2016년 보고서는 해양 표면 1km²당 평균 수치를 제시했다.","합성섬유 세탁이 미세섬유를 배출한다."]},' +
    '{"url":"https://b.org/y","title":"WWF","facts":["2021년 WWF는 원천 감축 조치가 필요하다고 제안했다."}]';
  assert.throws(() => JSON.parse(broken));
  const facts = parseFactJson(broken);
  assert.equal(facts.length, 3);
  assert.deepEqual(facts.map((f) => f.url), ["https://a.org/x", "https://a.org/x", "https://b.org/y"]);
  assert.equal(facts[2].title, "WWF");
  // 사실 안의 인라인 링크는 지운다(주소는 url 필드가 갖는다)
  const linked = parseFactJson('[{"url":"https://a.org/x","title":"A","facts":["1769년 와트가 증기기관을 개량했다 ([a.org](https://a.org/x))."]}]');
  assert.equal(linked[0].fact, "1769년 와트가 증기기관을 개량했다.");
  // 책 조사도 같은 깨짐을 견딘다
  const book = parseBookResearch('{"book":{"title":"데미안","author":"헤르만 헤세","exists":true},"sources":[{"url":"https://m.com/b","title":"민음사","facts":["『데미안』은 1919년에 출간됐다."}]}');
  assert.equal(book?.book.title, "데미안");
  assert.equal(book?.facts.length, 1);
});

test("사실이 넘치면 앞쪽 출처만 남기지 않고 출처를 돌아가며 고른다", () => {
  const raw = [
    ...Array.from({ length: 6 }, (_, i) => ({ fact: `배경 사실 문장 ${i}번이다.`, url: "https://a.org/1", title: "A" })),
    { fact: "전개 과정 사실 문장이다.", url: "https://b.org/2", title: "B" },
    { fact: "영향 사실 문장이다.", url: "https://c.org/3", title: "C" },
  ];
  const consulted = ["https://a.org/1", "https://b.org/2", "https://c.org/3"];
  const balanced = buildFacts(raw, consulted, 4)!;
  assert.deepEqual(balanced.map((f) => f.url), ["https://a.org/1", "https://a.org/1", "https://b.org/2", "https://c.org/3"]);
  assert.deepEqual(balanced.map((f) => f.id), ["F1", "F2", "F3", "F4"]);
  const old = buildFacts(raw, consulted, 4, false)!;
  assert.ok(old.every((f) => f.url === "https://a.org/1"));
});

test("제출용 보고서와 재료 단계를 구분하고, 출처 목록 항목을 알아본다", () => {
  assert.equal(isFinalReportForm({ label: "탐구 보고서" }), true);
  assert.equal(isFinalReportForm({ label: "조사 보고서" }), true);
  assert.equal(isFinalReportForm({ label: "보고서 계획서" }), false);
  assert.equal(isFinalReportForm({ label: "자료 수집" }), false);
  assert.equal(isSourceListItem("신뢰할 수 있는 출처 3개 이상"), true);
  assert.equal(isSourceListItem("참고 문헌"), true);
  assert.equal(isSourceListItem("출처의 신뢰도 비교"), false);
  assert.equal(isSourceListItem("해결 방안"), false);
  assert.equal(
    buildSourceListSection("신뢰할 수 있는 출처 3개 이상", [{ title: "UNEP 보고서", url: "https://unep.org/r" }, { title: "", url: "https://www.noaa.gov/x" }]),
    "### 신뢰할 수 있는 출처 3개 이상\n- UNEP 보고서: https://unep.org/r\n- noaa.gov: https://www.noaa.gov/x"
  );
});

test("조사 자료 규칙은 재료 단계에만 준다(실측 2026-10-22: 고민 분석·문제 해결 방안이 불릿 메모로 나옴)", () => {
  for (const label of ["자료 수집", "자료 조사", "사실 정리"]) assert.equal(isResearchMaterialStep({ label }), true, label);
  for (const label of ["2차시 고민뽑기 및 친구의 고민 분석하기", "문제 해결 방안 쓰기 (30점)", "3차시 책 처방전 쓰기", "탐구 보고서", "조사 보고서", "과정쓰기 (총 6점)"])
    assert.equal(isResearchMaterialStep({ label }), false, label);
});

test("본문 속 주소 표기를 지운다(실측: 출처 0개인 글에 주소가 그대로 남음)", () => {
  const t = "- 미세플라스틱은 5mm 이하 입자다 (UNEP 보고서). (UNEP: https://www.unep.org/resources/report/microplastics-0)\n자세한 내용은 [NOAA](https://noaa.gov/a)에 있다. 원문 https://x.org/p 참고.";
  const r = stripInlineUrls(t);
  assert.equal(r.content, "- 미세플라스틱은 5mm 이하 입자다 (UNEP 보고서).\n자세한 내용은 NOAA에 있다. 원문 참고.");
  assert.equal(r.removed, 3);
  assert.deepEqual(stripInlineUrls("주소 없는 글이다[1]."), { content: "주소 없는 글이다[1].", removed: 0 });
});

test("감상·의견 문장의 각주만 좁게 지운다", () => {
  const t =
    "나는 파울로 코엘료의 『연금술사』를 읽었다[1]. 1988년에 처음 나왔다[2]. 작품이 많이 읽힌 이유가 길을 묻게 만드는 힘에 있다고 생각한다[3]. 산티아고는 이집트로 떠난다[1].";
  const r = stripOpinionCitations(t);
  assert.equal(r.stripped, 1);
  assert.match(r.content, /힘에 있다고 생각한다\. 산티아고/);
  assert.match(r.content, /『연금술사』를 읽었다\[1\]/); // 책 제목이 있는 문장은 그대로
  assert.match(r.content, /1988년에 처음 나왔다\[2\]/); // 숫자가 있는 문장은 그대로
  assert.match(r.content, /이집트로 떠난다\[1\]/);
  assert.equal(stripOpinionCitations("### 제목[1]\n표 | 칸[2]").stripped, 0);
  // 실측 2026-10-21: 앞 절의 각주 번호 숫자 때문에 감상 문장이 통과했다 — 감상 절의 번호만 지운다
  const r2 = stripOpinionCitations("작품이 여러 언어로 번역된 사실이 알려져 있어[1][3], 많은 사람이 공감한 이야기라는 점도 느껴졌다[2][1].");
  assert.equal(r2.content, "작품이 여러 언어로 번역된 사실이 알려져 있어[1][3], 많은 사람이 공감한 이야기라는 점도 느껴졌다.");
});

test("외부 제작 결과의 작업 메모를 지운다(실측 2026-10-22: 현대사 신문·카드뉴스)", () => {
  const t = [
    "1945년 8월 15일은 일제의 식민 통치가 끝난 날이었다(한국의 광복 날짜는 1945년 8월 15일임을 확인했다).[1]",
    "짧은 글: \"부정선거가 시작이었다.\"",
    "출처(사실 표기 문장 끝):[1]",
    "",
    "### 인터뷰 출처·확인된 사실",
    "- 해방일과 관련한 기록 설명[1].",
    "- 미군정 자료[2].",
    "",
    "(위 인터뷰는 1차 자료를 바탕으로 재구성한 가상 대화입니다. 실제 발언으로 오해하지 마세요.)",
    "※ 위 세 출처는 본문에서 날짜를 확인한 공식 자료입니다.",
    "마지막 문단이다.",
  ].join("\n");
  const r = stripWorkNotes(t);
  assert.equal(r.content, '1945년 8월 15일은 일제의 식민 통치가 끝난 날이었다.[1]\n짧은 글: "부정선거가 시작이었다."[1]\n\n마지막 문단이다.');
  assert.ok(r.removed >= 5);
  assert.deepEqual(stripWorkNotes("평범한 문단(1945년)이다.[1]"), { content: "평범한 문단(1945년)이다.[1]", removed: 0 });
  const card = [
    "들어갈 말: 고등학생들이 먼저 거리로 나섰다. (약 30자)[2]",
    "",
    "(추가 안내 — 각 칸의 구성 요약)",
    "- 상단 3칸: 각 칸에 그림 자리",
    "- 하단 ④~⑥: 보충 설명",
    "",
    "(위 문장들 중 확인 가능한 사실에는 출처를 달았습니다. 필요하면 문구를 더 다듬어 드립니다.)",
  ].join("\n");
  assert.equal(stripWorkNotes(card).content, "들어갈 말: 고등학생들이 먼저 거리로 나섰다.[2]");
  assert.equal(stripWorkNotes("The bulb <u>was invented</u> to save energy.").content, "The bulb **was invented** to save energy.");
  assert.equal(
    stripWorkNotes("들어갈 말: 끝.\n\n(학생 감상 초안 — 본인 생각에 맞게 고쳐 쓰세요)\n### 인상적인 부분\n(학생 감상 초안 — 본인 생각에 맞게 고쳐 쓰세요)\n새롭게 알게 됐다.").content,
    "들어갈 말: 끝.\n\n### 인상적인 부분\n(학생 감상 초안 — 본인 생각에 맞게 고쳐 쓰세요)\n새롭게 알게 됐다."
  );
  assert.equal(stripWorkNotes("These changes help users.\n\n(총 158 words)").content, "These changes help users.");
  // 발표 대본·편지의 인사는 지우지 않는다
  assert.equal(stripWorkNotes("들어주셔서 감사드립니다.").removed, 0);
  assert.equal(stripWorkNotes("늘 응원할게. 고마워.").removed, 0);
});

test("책 제목 뒤 조사를 받침에 맞춘다(실측: 『사일구』은)", () => {
  assert.deepEqual(fixJosaAfterTitle("윤태호의 『사일구』은 만화다. 『빗창』는 4·3을 다룬다. 『불씨』를 읽었다."), {
    content: "윤태호의 『사일구』는 만화다. 『빗창』은 4·3을 다룬다. 『불씨』를 읽었다.",
    changed: 2,
  });
  assert.equal(fixJosaAfterTitle("『Demian』은 소설이다.").changed, 0);
});

test("각주가 붙은 전달형 꼬리만 단정형으로 바꾼다", () => {
  assert.deepEqual(reduceReportedSpeech("노동당 활동을 하다가 당을 떠났다는 기록이 있다[2]. 1858년 태어났다는 기록이 있다."), {
    content: "노동당 활동을 하다가 당을 떠났다[2]. 1858년 태어났다는 기록이 있다.",
    changed: 1,
  });
});

test("괄호 없는 작업 설명 줄도 지운다(실측 2026-10-21)", () => {
  const t = "해결 방안 문단이다[2].\n\n참고 근거: 위 문장들에 사용된 사실 근거는 본문에 괄호로 붙인 번호를 통해 확인할 수 있다.\n\n### 다음";
  const r = stripMetaNoteLines(t);
  assert.equal(r.removed, 1);
  assert.doesNotMatch(r.content, /참고 근거/);
  assert.equal(stripMetaNoteLines("참고로 나는 바다를 좋아한다.").removed, 0);
});

test("감상문에는 논설문 틀을 주지 않는다(끄면 예전 규칙)", () => {
  withEnv("ESSAY_QUALITY_FIXES", undefined, () => {
    assert.deepEqual(inferFormKinds({ label: "독서 감상문", description: "줄거리와 느낀 점" }), ["book_response"]);
    assert.doesNotMatch(buildFormRulesBlock([{ label: "독서 감상문", description: "" }]), /문제 제기/);
    assert.deepEqual(inferFormKinds({ label: "찬반 논설문", description: "반론 재반박" }), ["debate"]);
    assert.deepEqual(inferFormKinds({ label: "탐구 보고서", description: "배경, 전개" }), ["report"]);
    assert.equal(lengthRoleOf({ label: "탐구 보고서", description: "", items_format: "sections", required_items: ["배경", "전개", "영향", "시사점"] }), "report_sections");
  });
  withEnv("ESSAY_QUALITY_FIXES", "off", () => {
    assert.deepEqual(inferFormKinds({ label: "독서 감상문", description: "줄거리와 느낀 점" }), ["report"]);
    assert.match(buildFormRulesBlock([{ label: "독서 감상문", description: "" }]), /문제 제기/);
    assert.equal(lengthRoleOf({ label: "탐구 보고서", description: "", items_format: "sections", required_items: ["배경", "전개"] }), "material");
  });
});

test("과제와 무관한 공통 규칙 블록은 넣지 않는다", () => {
  withEnv("ESSAY_QUALITY_FIXES", undefined, () => {
    const science = promptRuleScope({ subject: "과학", texts: ["미세플라스틱 조사 보고서", "원인, 영향, 해결 방안"], hasPresetSubject: false });
    assert.deepEqual(science, { personAndPerspective: false, achievement: false, factualRigor: false });
    const letter = promptRuleScope({ subject: "국어", texts: ["친구에게 책 처방 편지 쓰기"], hasPresetSubject: false });
    assert.equal(letter.personAndPerspective, true);
    const history = promptRuleScope({ subject: "역사", texts: ["산업혁명 탐구 보고서"], hasPresetSubject: false });
    assert.equal(history.factualRigor, true);
    assert.equal(promptRuleScope({ subject: "사회", texts: ["인권 신문"], hasPresetSubject: true }).achievement, true);
  });
  withEnv("ESSAY_PROMPT_SCOPE", "all", () => {
    assert.deepEqual(promptRuleScope({ subject: "과학", texts: ["실험"], hasPresetSubject: false }), { personAndPerspective: true, achievement: true, factualRigor: true });
  });
});

test("원고의 각주 문장을 계획용 사실 노트로 바꾸고, 확인 실패한 출처 문장은 뺀다", async () => {
  const { factsFromCitedText } = await import("./research-notes.ts");
  const text = "## 인터뷰\n해방 직후 서울에서는 건국준비위원회가 조직되었다.[1] 느낌 문장이다.\n- 미군은 1945년 9월 인천에 상륙했다.[2]\n잘못된 출처 문장은 이렇게 길게 쓴다.[3]";
  const facts = factsFromCitedText(text, [
    { n: 1, title: "A", url: "https://a.kr/1", url_valid: true },
    { n: 2, title: "B", url: "https://b.kr/2", url_valid: null },
    { n: 3, title: "C", url: "https://c.kr/3", url_valid: false },
  ]);
  assert.deepEqual(facts.map((f) => [f.id, f.fact, f.url]), [
    ["F1", "해방 직후 서울에서는 건국준비위원회가 조직되었다.", "https://a.kr/1"],
    ["F2", "미군은 1945년 9월 인천에 상륙했다.", "https://b.kr/2"],
  ]);
});

test("문장 앞 서수 나열은 이음말로 바꾸고, 목록 줄의 표지는 지우고, '첫째 아이' 같은 낱말은 둔다", async () => {
  const { stripOrdinalEnumerators } = await import("./deliverable.ts");
  const r = stripOrdinalEnumerators("이유는 두 가지다. 첫째, 설명이 쉽다[1]. 둘째로 연습이 있다.\n- 셋째: 짧다.\n첫째 아이가 웃었다. 두 번째로, 끝.");
  assert.equal(r.content, "이유는 두 가지다. 먼저 설명이 쉽다[1]. 다음으로 연습이 있다.\n- 짧다.\n첫째 아이가 웃었다. 또한 끝.");
  assert.equal(r.changed, 4);
  // 두 개짜리 나열은 "먼저 / 또한", 세 개 이상은 "먼저 / 다음으로 / 마지막으로"
  assert.equal(stripOrdinalEnumerators("첫째, A다. 둘째, B다.").content, "먼저 A다. 또한 B다.");
  assert.equal(stripOrdinalEnumerators("첫째, A다. 둘째, B다. 셋째, C다.").content, "먼저 A다. 다음으로 B다. 마지막으로 C다.");
  // 문단마다 나뉜 나열도 하나로 본다
  assert.equal(stripOrdinalEnumerators("첫째, A다.\n\n둘째, B다.\n\n셋째, C다.").content, "먼저 A다.\n\n다음으로 B다.\n\n마지막으로 C다.");
});

test("강연·대화를 듣고 정리하는 단계는 기록지 규칙(지어내지 말고 빈칸)으로 본다", async () => {
  const { inferFormKinds } = await import("./form-rules.ts");
  assert.deepEqual(inferFormKinds({ label: "화법의 원리 파악하기", description: "강연 또는 대화를 듣고 맥락을 고려하여 말하기의 내용을 파악한다." }), ["observation_record"]);
  assert.notDeepEqual(inferFormKinds({ label: "문제 해결 방안 쓰기", description: "현안을 담은 기사에서 사회 문제를 찾아 해결 방안을 쓴다." }), ["observation_record"]);
});
