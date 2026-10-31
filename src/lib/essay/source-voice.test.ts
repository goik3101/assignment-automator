import { test } from "node:test";
import assert from "node:assert/strict";
import { findSourceVoiceSentences, sourceNames, sourceVoiceRepairText } from "./source-voice.ts";

// 사용자 결과물.9의 실제 출처 목록
const TITLES = [
  "헌법재판소 간행물(영문)",
  "참여연대 이슈리포트 제2011-10호",
  "임시조치 - 나무위키",
];

test("출처 제목에서 알아볼 이름만 뽑고 일반 낱말은 버린다", () => {
  const names = sourceNames(TITLES);
  assert.ok(names.includes("헌법재판소"));
  assert.ok(names.includes("참여연대"));
  assert.ok(names.includes("임시조치"));
  for (const generic of ["간행물", "이슈", "리포트", "나무위키", "영문"]) assert.ok(!names.includes(generic), generic);
});

test("결과물.9에서 사장님이 짚은 문장들을 잡는다", () => {
  const sec = [
    "참여연대의 2011년 이슈리포트는 강제적 인터넷 실명제가 표현의 자유를 침해할 수 있다고 문제를 제기했다.[2]",
    "이 보고서는 2010년 정보통신망 관련 법제와 인터넷 실명제 시행의 문제점도 분석했다.[2]",
    "헌법재판소는 표현의 자유를 헌법 제21조가 보장하는 기본권으로 설명한다.[1]",
  ].join("\n");
  assert.equal(findSourceVoiceSentences(sec, TITLES).length, 3);
});

test("기관이 실제로 한 일은 근거다 — 잡지 않는다", () => {
  const ok = [
    "헌법재판소는 2012년 8월 23일 제한적 본인확인제를 위헌으로 결정했다.[1]",
    "방송통신위원회는 2011년 12월 본인확인제 폐지를 검토하겠다고 발표했다.[2]",
    "2009년에는 최병성과 관련된 포털 게시물이 삭제된 사건이 있었다.[3]",
    "2008년 옥션에서 약 1,081만 건의 회원정보가 유출됐다.[2]",
  ].join("\n");
  assert.deepEqual(findSourceVoiceSentences(ok, TITLES), []);
});

test("출처 목록에 없는 이름은 건드리지 않는다", () => {
  // 인터뷰·대담에서 사람이 말한 것은 글의 내용이다.
  const sec = "김구는 통일 정부 수립이 먼저라고 설명했다.[1]\n학생들은 실명제가 필요하다고 주장했다.[2]";
  assert.deepEqual(findSourceVoiceSentences(sec, TITLES), []);
});

test("되가리킴은 동사와 상관없이 잡는다", () => {
  assert.equal(findSourceVoiceSentences("이 자료는 2010년 통계를 담고 있다.[1]", []).length, 1);
  assert.equal(findSourceVoiceSentences("해당 기사는 사고 경위를 자세히 전한다.[2]", []).length, 1);
  // 출처 목록이 비어 있어도 되가리킴은 잡힌다.
  assert.equal(findSourceVoiceSentences("위 보고서는 세 가지 문제를 들었다.[1]", []).length, 1);
});

test("책을 말하는 문장은 보지 않는다(독후감·카드뉴스)", () => {
  const sec = "《사일구》는 4·19혁명을 겪은 사람들의 이야기를 다루고 있다.[1]\n『수레바퀴 아래서』는 학교의 억압을 설명한다.[2]";
  assert.deepEqual(findSourceVoiceSentences(sec, ["사일구 - 윤태호", "수레바퀴 아래서"]), []);
});

test("소제목·표·출처 목록 줄은 보지 않는다", () => {
  const sec = "### 근거\n| 헌법재판소는 | 설명한다 |\n- 참여연대 이슈리포트는 이렇게 설명한다: https://example.com";
  assert.deepEqual(findSourceVoiceSentences(sec, TITLES), []);
});

test("짧은 조각은 문장으로 세지 않는다", () => {
  assert.deepEqual(findSourceVoiceSentences("참여연대는 밝혔다.", TITLES), []);
});

test("보완 지시는 사실을 바로 쓰라고 하고 각주는 두라고 한다", () => {
  const t = sourceVoiceRepairText("개요", [{ text: "이 보고서는 ~를 분석했다", name: null }]);
  assert.ok(t.includes("개요"));
  assert.ok(t.includes("각주"));
  assert.ok(t.includes("기관이 실제로 한 일"));
});

test("글 자신을 말하는 문장은 되가리킴이 아니다", () => {
  // 실측(2026-11-01 전수 적용): "이 글은 …"이 저장된 결과물 거의 전부에서 잘못 잡혔다.
  assert.deepEqual(findSourceVoiceSentences("이 글은 인터넷 실명제 도입에 반대하는 논리를 정리해 또래에게 설명한다.", []), []);
});

test("쓸 차례를 말하는 문장은 근거가 아니라 글의 짜임이다", () => {
  const sec = [
    "먼저 헌법재판소의 위헌 결정과 그 이유를 근거로 실명제의 법적 문제를 설명한다.",
    "본론에서는 실효성 판단 근거를 제시하며 감소 효과가 확인되지 않았음을 설명한다.",
    "마지막으로 대안을 소개한다.",
  ].join("\n");
  assert.deepEqual(findSourceVoiceSentences(sec, TITLES), []);
});

test("출처 제목에 든 주제어는 출처 이름으로 쓰지 않는다", () => {
  // 실측: 출처가 "인터넷 실명제 위헌확인 - 헌법재판소"라 "실명제"가 이름이 되어 본문 문장을 전부 잡았다.
  const titles = ["인터넷 실명제 위헌확인 - 헌법재판소 판례정보"];
  const exclude = ["인터넷 실명제 도입에 반대하는 입장에서 매체를 활용해 발표하기"];
  assert.ok(!sourceNames(titles, exclude).includes("실명제"));
  assert.ok(sourceNames(titles, exclude).includes("헌법재판소"));
  assert.deepEqual(findSourceVoiceSentences("실명제는 익명 표현을 위축시킨다고 평가했다.[1]", titles, exclude), []);
});

test("이름이 주어 자리에 있을 때만 잡는다", () => {
  const titles = ["표현의 자유와 인터넷 - 오픈넷"];
  // "자유"는 두 글자라 이름이 되지 않고, 설령 돼도 주어 자리가 아니다.
  assert.deepEqual(findSourceVoiceSentences("헌법소원심판 청구인들은 실명확인 제도가 표현의 자유 등 기본권을 침해한다고 주장했다.", titles), []);
  // 같은 출처라도 주어로 서면 잡는다.
  assert.equal(findSourceVoiceSentences("오픈넷은 제도의 목적을 다른 수단으로도 이룰 수 있다고 주장했다.", titles).length, 1);
  assert.equal(findSourceVoiceSentences("오픈넷 보고서는 입법 목적에 피해자 구제가 포함됐다고 정리했다.", titles).length, 1);
});
