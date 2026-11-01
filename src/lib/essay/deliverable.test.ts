import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNewspaperBlock, newspaperSectionRole, stripFormLead } from "./deliverable.ts";

test("신문 영역이 각각 별개 단계면 그 칸 하나만 쓰게 한다", () => {
  // 실측(결과물.10): "이 단계는 신문 그 자체다"라는 지시 때문에 머리기사 안에 인터뷰·사설·만평이 다 들어갔다.
  const many = buildNewspaperBlock({ label: "머리기사", requiredItems: ["제목", "내용"], materialLabels: [], sectionOfMany: true });
  assert.ok(many.includes("신문 전체가 아니라"));
  assert.ok(many.includes("다른 영역"));
  assert.ok(many.includes("제호)·날짜·호수·기자 이름을 쓰지 말 것"), "칸 하나를 쓸 때는 제호를 금지해야 한다");
  const solo = buildNewspaperBlock({ label: "현대사 신문", requiredItems: ["머리기사", "인터뷰"], materialLabels: [] });
  assert.ok(solo.includes("제호"));
});

test("신문 영역마다 역할을 나눠 준다", () => {
  // 실측: 네 영역이 각자 배경부터 다시 설명해 "치안과 공공 행정, 교육과 통신"이 세 영역에 모두 나왔다.
  assert.ok(newspaperSectionRole("머리기사", true).includes("배경 설명은 이 영역만"));
  assert.ok(newspaperSectionRole("인터뷰", false).includes("겪은 사람의 말"));
  assert.ok(newspaperSectionRole("인터뷰", false).includes("배경을 설명하지 말고"));
  assert.ok(newspaperSectionRole("사설/칼럼", false).includes("주장"));
  assert.ok(newspaperSectionRole("만평/광고", false).includes("그림과 짧은 설명"));
  // 배경을 맡지 않은 기사면 일반 지시.
  assert.ok(newspaperSectionRole("지역 소식", false).includes("다시 설명하지 말 것"));
});

test("칸 이름을 글에 옮겨 적지 말라고 한다", () => {
  // 실측: 인터뷰 글이 "신문 양식에 인터뷰 대상: …"으로 시작했다.
  const b = buildNewspaperBlock({ label: "인터뷰", requiredItems: ["인터뷰 대상", "질문1"], materialLabels: [], sectionOfMany: true });
  assert.ok(b.includes("칸 이름을 글에 옮겨 적지 말 것"));
});

test("글머리에 붙은 양식 안내를 뗀다", () => {
  // 실측(2026-11-01 역사 신문): 인터뷰 글이 "활동지 양식에 인터뷰 대상: …"으로 시작했다.
  const r = stripFormLead("활동지 양식에 인터뷰 대상: 1945년 해방 직후 서울에 사는 주민이다.\n신문 양식에 질문과 답변: 질문1 — …");
  assert.equal(r.removed, 2);
  assert.ok(r.content.startsWith("1945년 해방 직후"));
  assert.ok(r.content.includes("질문1 — …"));
  // 평범한 문장은 건드리지 않는다.
  assert.equal(stripFormLead("양식에 맞춰 쓴 글이다.\n제목: 광복과 건국").removed, 0);
});
