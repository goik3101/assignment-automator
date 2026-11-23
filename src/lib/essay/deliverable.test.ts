import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNewspaperBlock, newspaperSectionLabels, newspaperSectionRole, splitProductionNotes, stripFormLead, studentPreparedVisuals, studentPreparedVisualsForStep, stripOtherAreaSubsections, dropProductionNotesHeading } from "./deliverable.ts";

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

test("자료 수집 단계는 신문 지면의 영역이 아니다(인권 저널: 자료 수집 + 신문)", () => {
  const els = [
    { label: "자료 수집", description: "인물 배경·주요 활동을 수행평가지에 기록한다" },
    { label: "신문", description: "수집한 자료를 토대로 신문을 제작한다" },
  ];
  assert.deepEqual(newspaperSectionLabels("인권 선구자의 업적을 탐구하고 신문을 제작한다", els), []);
  // 지면의 영역이 둘 이상이면 재료 단계만 빠진다.
  const withAreas = [{ label: "자료 조사", description: "조사한다" }, { label: "머리기사", description: "쓴다" }, { label: "사설", description: "쓴다" }];
  assert.deepEqual(newspaperSectionLabels("현대사 신문 만들기", withAreas), ["머리기사", "사설"]);
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

test("제작 참고를 떼면 칸이 비는 경우에는 떼지 않는다 (만평 칸이 0자가 된 실측)", () => {
  // 기준선 3회 중 2회의 실제 모양 — 그릴 그림과 비판 대상이 제작 참고 안에 들어갔다
  const bare = `### 지도 위의 선, 빠진 목소리

### 제작 참고
한반도 지도를 그리고 북위 38도선 위아래에 소련군과 미군의 표식을 각각 둔다. 말풍선에는 "우리 앞날을 정할 목소리는 어디에 있나?"라고 적는다.
무엇을 비판하는가: 항복 구역을 정하는 과정에 당사자인 한국인의 뜻이 빠졌다는 점을 비판한다.`;
  const r = splitProductionNotes(bare);
  assert.equal(r.notes, null, "칸이 비는데도 떼어 냈다");
  assert.ok(r.body.includes("한반도 지도를 그리고"), "칸 내용이 사라졌다");

  // 칸에 글이 충분히 남으면 예전처럼 떼어 낸다
  const normal = `### 남한에 대한민국 정부 수립
1948년 8월 15일 대한민국 정부가 수립됐다. 국내 언론은 미·중의 승인 사실과 국내 정당의 환영 입장을 함께 전했다. 광복 뒤 3년 만의 일이다.

### 제작 참고
머리기사 옆에 넣을 사진·그림·지도 중 하나를 직접 준비하세요.`;
  const r2 = splitProductionNotes(normal);
  assert.ok(r2.notes?.includes("직접 준비하세요"));
  assert.ok(!r2.body.includes("직접 준비하세요"));
});

test("한 영역 안에 만들어 넣은 다른 영역 소제목을 뗀다 (신문 3회 모두 걸렸다)", () => {
  const head = `**〈광복과 새 나라〉**

### 대한민국 정부 수립 공식 선언
**이승만, 1948년 8월 15일 기념사에서 새 정부 출범을 선포**

이승만은 1948년 8월 15일 정부 수립을 공식 선언했다.[2]

### 광고 — 신문
대한민국 신정부 수립 소식을 전하는 신문! 새 나라의 소식을 읽어 보세요.`;
  const r = stripOtherAreaSubsections(head, "머리기사", ["머리기사", "인터뷰", "사설/칼럼", "만평/광고"]);
  assert.deepEqual(r.removed, ["광고 — 신문"]);
  assert.ok(!r.content.includes("신문! 새 나라의 소식"), "광고 본문이 남았다");
  assert.ok(r.content.includes("정부 수립 공식 선언"), "멀쩡한 소제목이 사라졌다");
});

test("기사 본문이 다른 영역을 말하는 것은 건드리지 않는다", () => {
  const head = `### 신문사 경영난 심화
광고 수입이 줄어 신문사들이 어려움을 겪고 있다.[1] 사설과 만평을 줄이는 곳도 있다.[1]`;
  assert.deepEqual(stripOtherAreaSubsections(head, "머리기사", ["머리기사", "만평/광고", "사설/칼럼"]).removed, []);
});

test("자기 영역 이름 소제목은 남긴다", () => {
  const sec = "### 만평 — 통일의 다리 앞에서\n줄다리기 그림을 그린다.";
  assert.deepEqual(stripOtherAreaSubsections(sec, "만평/광고", ["머리기사", "만평/광고"]).removed, []);
});

test("그림 칸에 남는 '제작 참고' 라벨만 떼고 내용은 칸에 남긴다 (사슬 감사가 3편에서 찾음)", () => {
  const panel = `### 만평 — 지도 위의 선

### 제작 참고
한반도 지도를 그리고 38도선 위아래에 두 손을 그린다.
무엇을 비판하는가: 당사자의 뜻이 빠진 결정을 비판한다.`;
  const r = dropProductionNotesHeading(panel);
  assert.equal(r.dropped, true);
  assert.ok(!r.content.includes("제작 참고"), "라벨이 남았다");
  assert.ok(r.content.includes("한반도 지도를 그리고"), "그릴 그림 설명이 사라졌다");
  assert.ok(r.content.includes("무엇을 비판하는가"), "비판 대상이 사라졌다");
  // 라벨이 없으면 아무것도 바꾸지 않는다
  const plain = "### 만평 — 지도 위의 선\n줄다리기를 그린다.";
  assert.deepEqual(dropProductionNotesHeading(plain), { content: plain, dropped: false });
});

test("사진 준비 안내는 안내문이 말한 칸에만 붙는다(전체 요구사항 한 문장이 모든 칸에 번지지 않는다)", () => {
  const labels = ["머리기사", "인터뷰", "사설 / 칼럼", "만평 / 광고"];
  const shared = ["머리기사에 사진, 그림, 지도는 미리 준비할 것.", "5반 손글씨 안내: B4용지, 분량제한 X."];
  assert.deepEqual(studentPreparedVisualsForStep("머리기사", labels, shared).sort(), ["그림", "사진", "지도"]);
  assert.deepEqual(studentPreparedVisualsForStep("인터뷰", labels, shared), []);
  assert.deepEqual(studentPreparedVisualsForStep("사설 / 칼럼", labels, shared), []);
  // 칸 자신의 설명에 있으면 그대로 읽는다
  assert.deepEqual(studentPreparedVisualsForStep("인터뷰", labels, shared, "인터뷰 사진을 준비한다").sort(), ["사진"]);
  // 칸 이름을 말하지 않는 문장은 예전처럼 모든 칸에 적용(칸이 하나뿐인 과제)
  assert.deepEqual(studentPreparedVisualsForStep("보고서", ["보고서"], ["사진은 미리 준비할 것."]), ["사진"]);
});

test("칸 이름이 없는 '사진은 미리 준비' 문장은 자기 설명에 시각 자료가 있는 칸에만 걸린다", () => {
  const labels = ["머리기사", "인터뷰", "사설/칼럼", "만평/광고"];
  const shared = ["사진·그림·지도는 미리 준비하고 못 하면 수행평가 시간에 그릴 수 있음."];
  const guide = "머리기사: 양식 칸은 제목·내용이며 사진/그림/지도 자리도 있다. 제목 약 1줄. 인터뷰: 인터뷰 대상 기입란, 질문1·답변1 칸. 사설/칼럼: 제목 약 1줄, 내용 약 5줄.";
  assert.deepEqual(studentPreparedVisualsForStep("머리기사", labels, shared, "기사를 쓴다", guide).sort(), ["그림", "사진", "지도"]);
  assert.deepEqual(studentPreparedVisualsForStep("인터뷰", labels, shared, "인터뷰를 구성한다", guide), []);
  assert.deepEqual(studentPreparedVisualsForStep("사설/칼럼", labels, shared, "사설을 쓴다", guide), []);
});

test("stripInlineUrls: 코드 펜스 안의 http 비교·빈 괄호는 지우지 않고 본문 주소만 지운다", async () => {
  const { stripInlineUrls } = await import("./deliverable.ts");
  const code = '```python\nlower = message.lower()\nhas_link = "http://" in lower or "https://" in lower\n```';
  const t = `자세한 내용은 https://example.com/a 에 있다.\n\n${code}`;
  const r = stripInlineUrls(t);
  assert.ok(r.content.includes(code));
  assert.ok(!r.content.includes("example.com"));
  assert.equal(r.removed, 1);
  assert.equal(stripInlineUrls(code).removed, 0);
});

test("mapOutsideCodeFences: 펜스 밖에만 함수를 적용하고 펜스 안은 그대로 둔다", async () => {
  const { mapOutsideCodeFences } = await import("./code-fence.ts");
  const t = "앞 [메모]\n\n```python\nx = []\n    y = f()\n```\n\n뒤 [메모]";
  assert.equal(mapOutsideCodeFences(t, (p) => p.replaceAll("[메모]", "")), "앞 \n\n```python\nx = []\n    y = f()\n```\n\n뒤 ");
  assert.equal(mapOutsideCodeFences("펜스 없음 [메모]", (p) => p.replaceAll("[메모]", "")), "펜스 없음 ");
});

test("maskCodeFences: 펜스를 가렸다가 그대로 되돌린다", async () => {
  const { maskCodeFences } = await import("./code-fence.ts");
  const t = '앞 "따옴표 문장입니다 여덟자"\n```python\nprint("판정: ", x)\n```\n뒤';
  const m = maskCodeFences(t);
  assert.ok(!m.masked.includes("print("));
  assert.equal(m.restore(m.masked), t);
  assert.equal(maskCodeFences("펜스 없음").masked, "펜스 없음");
});
