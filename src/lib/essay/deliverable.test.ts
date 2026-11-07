import { test } from "node:test";
import assert from "node:assert/strict";
import { studentPreparedVisuals, buildNewspaperBlock, newspaperSectionLabels, newspaperSectionRole, stripFormLead } from "./deliverable.ts";

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
  // 2026-11-07: "그림과 짧은 설명"이라고만 하니 두 문단짜리 역사 설명이 나왔다 — 세 줄 형식을 못 박았다.
  assert.ok(newspaperSectionRole("만평/광고", false).includes("그림 칸"));
  assert.ok(newspaperSectionRole("만평/광고", false).includes("그릴 그림:"));
  assert.ok(newspaperSectionRole("만평/광고", false).includes("각주도 달지 말 것"));
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

test("신문을 만드는 과제면 단계 전부가 그 신문의 영역이다", () => {
  // 실측: 단계 이름만 보면 "머리기사"만 잡히고 인터뷰·사설·만평은 놓쳐 영역 분담이 한 번도 돌지 않았다.
  const els = ["머리기사", "인터뷰", "사설/칼럼", "만평/광고"].map((label) => ({ label, description: `${label}를 쓴다` }));
  assert.deepEqual(
    newspaperSectionLabels("광복부터 대한민국 정부 수립 사이의 현대사를 주제로 신문 만들기", els),
    ["머리기사", "인터뷰", "사설/칼럼", "만평/광고"]
  );
});

test("신문을 자료로 쓰는 과제는 영역으로 보지 않는다", () => {
  const els = [
    { label: "신문 기사 스크랩", description: "기사를 붙인다" },
    { label: "경제 문제 분석 평가지", description: "원인과 영향을 쓴다" },
  ];
  assert.deepEqual(newspaperSectionLabels("시장 경제 문제를 선정하고 관련 신문 기사를 바탕으로 원인·양상을 분석", els), []);
  assert.deepEqual(newspaperSectionLabels("인터넷 실명제에 반대하는 의견 발표하기", els), []);
});

test("단계가 하나뿐이면 영역이 아니다", () => {
  assert.deepEqual(newspaperSectionLabels("현대사 신문 만들기", [{ label: "신문", description: "신문을 만든다" }]), []);
});

test("신문을 자료로 쓰면서 글을 '작성'하는 과제도 영역이 아니다", () => {
  // 회귀: 느슨한 판정이 사회 평가지를 신문 영역으로 묶어 순서를 바꿨다.
  const els = [
    { label: "신문 기사 스크랩", description: "기사를 붙인다" },
    { label: "경제 문제 분석 및 소견 평가지", description: "원인과 영향을 쓴다" },
  ];
  assert.deepEqual(
    newspaperSectionLabels("시장 경제 체제에서 나타나는 경제 문제를 선정하고, 관련 신문 기사를 바탕으로 원인·양상·영향·해결 방안을 작성", els),
    []
  );
});

test("안내문이 '준비한다'고 한 시각 자료를 읽는다", () => {
  assert.deepEqual(studentPreparedVisuals(["사진·그림·지도는 미리 준비할 수 있으며, 직접 그린 그림도 가능하다."]).sort(), ["그림", "사진", "지도"]);
});

test("금지 문장에는 걸리지 않는다", () => {
  assert.deepEqual(studentPreparedVisuals(["사진출력 ×, 그림이나 표는 필수"]), []);
  assert.deepEqual(studentPreparedVisuals(["사진은 사용할 수 없다."]), []);
});

test("시각 자료 말이 없으면 빈 배열", () => {
  assert.deepEqual(studentPreparedVisuals(["원인과 해결 방안을 쓴다."]), []);
});
