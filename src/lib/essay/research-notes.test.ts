import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFacts, extractSummaryLines, factSheetText, mapFactMarkers, normalizeUrl, parseFactJson } from "./research-notes.ts";

test("주소 정규화: 추적 쿼리·www·끝 슬래시는 같은 주소로 본다", () => {
  assert.equal(normalizeUrl("https://www.Example.org/a/?utm_source=openai"), normalizeUrl("https://example.org/a"));
  assert.notEqual(normalizeUrl("https://example.org/a?id=1"), normalizeUrl("https://example.org/a?id=2"));
});

test("JSON 배열을 설명·코드펜스가 섞여도 읽고, 잘못된 항목은 버린다", () => {
  const t = '결과입니다:\n```json\n[{"fact":"1769년 와트가 증기기관을 개량했다.","url":"https://a.org/x","title":"A"},{"fact":"짧","url":"https://b.org"},{"fact":"주소가 없는 사실 문장입니다.","url":"not-a-url"}]\n```';
  const r = parseFactJson(t);
  assert.equal(r.length, 1);
  assert.equal(r[0].url, "https://a.org/x");
  assert.deepEqual(parseFactJson("배열 없음"), []);
});

test("검색이 열어 보지 않은 주소의 사실은 버리고, 목록이 없으면 null", () => {
  const raw = [
    { fact: "1760년대 영국에서 방적기가 발명됐다.", url: "https://www.a.org/p?utm_source=x", title: "A" },
    { fact: "지어낸 주소의 사실 문장입니다.", url: "https://fake.org/zzz", title: "F" },
    { fact: "1760년대 영국에서 방적기가 발명됐다.", url: "https://a.org/p", title: "A" },
  ];
  const facts = buildFacts(raw, ["https://a.org/p"])!;
  assert.equal(facts.length, 1);
  assert.equal(facts[0].id, "F1");
  assert.equal(buildFacts(raw, []), null);
  assert.equal(buildFacts(raw, undefined), null);
  assert.equal(factSheetText(facts), "[F1] 1760년대 영국에서 방적기가 발명됐다.");
});

test("[F#]를 출처 번호로 바꾼다: 처음 나온 순서, 같은 URL 합침, 모르는 번호는 삭제", () => {
  const facts = [
    { id: "F1", fact: "a", url: "https://a.org/p", title: "A" },
    { id: "F2", fact: "b", url: "https://b.org/q", title: "B" },
    { id: "F3", fact: "c", url: "https://www.a.org/p/", title: "" },
  ];
  const r = mapFactMarkers("첫째다.[F2] 둘째다.[F1][F3] 셋째다.[F9] 끝.", facts);
  assert.equal(r.text, "첫째다.[1] 둘째다.[2] 셋째다. 끝.");
  assert.deepEqual(r.sources.map((s) => [s.n, s.url]), [[1, "https://b.org/q"], [2, "https://a.org/p"]]);
  assert.equal(r.unknown, 1);
});

test("맨 앞 불릿 줄을 요약으로 뽑는다", () => {
  const t = "- 첫 요약이다.\n- 둘째 요약이다.\n- 셋째 요약이다.\n\n## 단계 하나\n- 이건 본문 불릿\n본문";
  assert.deepEqual(extractSummaryLines(t), ["첫 요약이다.", "둘째 요약이다.", "셋째 요약이다."]);
  assert.deepEqual(extractSummaryLines("## 바로 제목\n본문"), []);
});

import { attachFactMarkers } from "./research-notes.ts";
test("번호가 없는 문장에 같은 연도·수치를 가진 사실의 번호를 붙인다", () => {
  const facts = [
    { id: "F1", fact: "2020년 정부가 2050 탄소중립을 선언했다.", url: "https://a.org", title: "A" },
    { id: "F2", fact: "지구 평균기온은 산업화 이전보다 약 1.1°C 높아졌다.", url: "https://b.org", title: "B" },
  ];
  const t = "우리 정부는 2020년에 탄소중립을 선언했다. 그래서 학교도 실천해야 한다. 이미 기온이 올랐다.[F2]\n## 제목 2020년";
  const r = attachFactMarkers(t, facts);
  assert.match(r.text, /2020년에 탄소중립을 선언했다\.\[F1\]/);
  assert.match(r.text, /실천해야 한다\. /); // 숫자 없는 문장은 그대로
  assert.equal(r.attached, 1);
  assert.match(r.text, /## 제목 2020년$/m); // 제목 줄은 건드리지 않음
});

import { confirmBookFromPages, parseBookResearch } from "./research-notes.ts";
test("책 조사 응답을 읽고, 서지는 페이지 본문에 실제로 있을 때만 확인한다", () => {
  const txt = '```json\n{"book":{"title":"어린 왕자","author":"앙투안 드 생텍쥐페리","exists":true},"facts":[{"fact":"『어린 왕자』는 1943년에 출간됐다.","url":"https://a.org/b","title":"A","printed_title":"The Little Prince","printed_author":"Antoine de Saint-Exupéry"},{"fact":"주인공은 소행성에서 온 어린 왕자다.","url":"https://a.org/c","title":"C"}]}\n```';
  const r = parseBookResearch(txt)!;
  assert.equal(r.book.title, "어린 왕자");
  assert.equal(r.book.exists, true);
  assert.equal(r.facts.length, 2);
  assert.equal(r.facts[0].printedAuthor, "Antoine de Saint-Exupéry");
  assert.equal(parseBookResearch("배열만 [1,2]"), null);
  const facts = buildFacts(r.facts, ["https://a.org/b", "https://a.org/c"])!;
  const page = "x".repeat(10) + " The Little Prince by Antoine de Saint-Exupéry, Reynal & Hitchcock 1943";
  assert.equal(confirmBookFromPages(facts, () => page), true);
  assert.equal(confirmBookFromPages(facts, () => "The Little Prince only"), false);
  const long = [{ ...facts[0], printedTitle: "The Little Prince / Written and Drawn by / Antoine de Saint-Exupéry" }];
  assert.equal(confirmBookFromPages(long, () => "the little prince by antoine de saint-exupéry"), true);
  assert.equal(confirmBookFromPages(facts, () => null), false);
});

import { mergeFacts } from "./research-notes.ts";

test("보강 조사 사실을 합칠 때 중복은 버리고 번호를 다시 매긴다", () => {
  const base = [
    { id: "F1", fact: "2012년 헌법재판소가 인터넷 실명제를 위헌으로 결정했다.", url: "https://a.go.kr/1", title: "A" },
    { id: "F2", fact: "제한적 본인확인제는 2007년에 도입됐다.", url: "https://a.go.kr/2", title: "A" },
  ];
  const extra = [
    // 같은 사실을 표현만 바꾼 것 — 버린다
    { id: "F1", fact: "헌법재판소는 2012년 인터넷 실명제가 위헌이라고 결정했다.", url: "https://b.org/x", title: "B" },
    { id: "F2", fact: "악성 댓글은 2016년 기준 하루 평균 3만 건 신고됐다.", url: "https://b.org/y", title: "B" },
  ];
  const merged = mergeFacts(base, extra);
  assert.equal(merged.length, 3);
  assert.deepEqual(merged.map((f) => f.id), ["F1", "F2", "F3"]);
  assert.match(merged[2].fact, /악성 댓글/);
  // 같은 주소의 같은 문장도 버린다
  assert.equal(mergeFacts(base, [{ ...base[0], id: "F9" }]).length, 2);
  // 상한을 넘기지 않는다
  assert.equal(mergeFacts(base, extra, 2).length, 2);
});
