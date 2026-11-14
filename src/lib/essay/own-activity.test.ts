import { test } from "node:test";
import assert from "node:assert/strict";
import { countBlanks, findOwnActivitySentences, isOwnActivitySentence, isOwnRecordStep } from "./own-activity.ts";

// 실제 제출 직전 결과물(2026-10-29)에서 그대로 가져온 문장들 — 학생이 하지 않은 행동을 썼다고 한 경우.
const FABRICATED = [
  "오늘 수업 시간 중 스마트폰으로 정부 통계 요약 페이지와 보도자료, 관련 통계표 화면을 촬영했다.",
  "국제 비교 자료로 OECD의 2020년 기준 노인 소득 빈곤율 통계를 캡처해 보관했다.",
  "보건복지부가 2024년 기초연금 선정기준액을 상향한 발표를 확인했고, 해당 화면을 촬영했다.",
  "기사 제목과 날짜가 보이게 출력했다.",
];
// 사실 서술 — 주어가 기관이거나 학생 행동이 아니다.
const FACTUAL = [
  "헌법재판소는 2012년 8월 23일 본인확인제가 표현의 자유를 침해한다고 결정했다.",
  "통계청은 65세 이상 노인의 상대적 빈곤율을 해마다 집계해 발표한다.",
  "연구진이 설문조사를 실시했다.",
  "노인 빈곤율은 2011년 57.0%에서 2023년 55.5%로 낮아졌다.",
];

test("학생이 하지 않은 행동을 쓴 문장만 가려낸다", () => {
  for (const s of FABRICATED) assert.equal(isOwnActivitySentence(s), true, s);
  for (const s of FACTUAL) assert.equal(isOwnActivitySentence(s), false, s);
});

test("소제목·표 줄은 보지 않고, 불릿 문장은 본다", () => {
  const content = `### 수집 방법\n| 촬영했다 |\n- 스마트폰으로 통계표 화면을 촬영했다.\n헌법재판소는 위헌으로 결정했다.`;
  const hits = findOwnActivitySentences(content);
  assert.equal(hits.length, 1);
  assert.match(hits[0], /스마트폰으로/);
});

test("직접 수행 기록 단계를 가려내고 빈칸을 센다", () => {
  assert.equal(isOwnRecordStep({ label: "자료 수집 및 기록", description: "자료를 조사해 기록한다." }), true);
  assert.equal(isOwnRecordStep({ label: "청중 기록지", description: "" }), true);
  assert.equal(isOwnRecordStep({ label: "정책 제안서", description: "해결 방안을 제안한다." }), false);
  // 실제 결과물(결과물.2.txt)의 빈칸 표기
  const t = "날짜: [직접 작성: 조사한 날짜]\n[직접 작성: 관할 시·군·구 이름]의 경보 빈도\n고농도 일수 [직접 작성: 캡처한 일수]일";
  assert.equal(countBlanks(t), 3);
  assert.equal(countBlanks("빈칸 없는 글"), 0);
});

test("각주가 달린 역사 사실은 학생 행동이 아니다", () => {
  assert.equal(isOwnActivitySentence("유엔 위원단이 북한 지역을 방문하지 못했다.[2]"), false);
  assert.equal(isOwnActivitySentence("유엔 한국 문제 위원단은 1948년 1월 남한에 도착해 방안을 논의했다.[4]"), false);
});

test("각주가 없는 날조는 그대로 잡는다", () => {
  assert.equal(isOwnActivitySentence("신문 기사를 스크랩해서 붙였다."), true);
  assert.equal(isOwnActivitySentence("직접 촬영했다."), true);
});

test("지어낸 것임을 글이 밝힌 문장은 거짓 기록이 아니다 (역사 신문 가상 인터뷰 — 13회 내내 거짓 경고였다)", () => {
  // 걸리면 안 되는 것
  assert.equal(
    isOwnActivitySentence("인터뷰 대상: 해방 뒤 남한에서 새 정부의 출범을 지켜본 시민을 가상 인물로 설정했다."),
    false
  );
  assert.equal(isOwnActivitySentence("당시를 겪은 시민을 가상으로 설정해 인터뷰를 구성했다."), false);
  assert.equal(isOwnActivitySentence("상상 인터뷰 형식으로 질문과 답변을 적었다."), false);
  assert.equal(isOwnActivitySentence("전태일이 살아 있다고 가정하고 인터뷰를 썼다."), false);
  assert.equal(isOwnActivitySentence("예시로 든 설문 문항을 아래에 붙였다."), false);
  // 여전히 걸려야 하는 것 — "가상"이라는 말이 없으면 그대로 거짓 기록이다
  assert.equal(isOwnActivitySentence("우리 반 학생 30명을 인터뷰했다."), true);
  assert.equal(isOwnActivitySentence("시청을 방문해 담당자와 인터뷰했다."), true);
  assert.equal(isOwnActivitySentence("설문지를 인쇄해 교실에 붙였다."), true);
});

test("각주를 어떻게 붙였는지 말하는 작업 메모는 날조가 아니다 (235편 중 8건이 이 오탐이었다)", () => {
  assert.equal(isOwnActivitySentence("각 주장에는 해당 사실의 근거 번호를 붙여 발표 자료와 스토리보드에서 참고할 수 있게 정리했다."), false);
  assert.equal(isOwnActivitySentence("위의 근거들은 본문에서 해당 문장 끝에 괄호 대신 각주 형태로 번호를 붙여 나타내었다."), false);
  assert.equal(isOwnActivitySentence("(근거 번호는 본문 문장 끝에 표기된 대로 첨부했다.)"), false);
});

test("인용한 설문·조사와 방문자 수는 학생이 한 일이 아니다", () => {
  assert.equal(
    isOwnActivitySentence("한국리서치의 2020년 11월 설문에서 응답자의 약 80%가 악성 댓글 방지를 위해 인터넷 실명제 도입에 찬성했다."),
    false
  );
  assert.equal(isOwnActivitySentence("일평균 방문자 기준이 낮아진 점 등을 제시해 제도적 확장이 문제였음을 보여주었다."), false);
  // 학생이 직접 한 설문은 그대로 잡는다("에서"로 인용한 게 아니다)
  assert.equal(isOwnActivitySentence("같은 반 학생들에게 설문을 실시했다."), true);
  // 알려진 구멍: 과거 어미가 "했/였/었/았/뒀"로 끝나지 않으면("설문을 돌렸다") 아직 못 잡는다.
  // 어미 목록을 늘리면 "낮아졌다"처럼 사실 서술까지 걸릴 위험이 있어 실측 없이 넓히지 않는다.
  assert.equal(isOwnActivitySentence("같은 반 학생들에게 설문을 돌렸다."), false);
});

test("원래 잡던 날조는 그대로 잡는다 (2026-10-29 실제 결과물)", () => {
  assert.equal(isOwnActivitySentence("오늘 수업 시간 중 스마트폰으로 기상청 화면을 촬영했다."), true);
  assert.equal(isOwnActivitySentence("OECD 비교 통계를 캡처해 보관했다."), true);
  assert.equal(isOwnActivitySentence("수행평가지에 각 사진 아래에 출처를 오려 붙였다."), true);
  assert.equal(isOwnActivitySentence("시청 민원실을 방문해 자료를 받았다."), true);
});

test("인쇄가 과제 주제일 수 있다 — 단독 '인쇄'를 날조로 잡지 않는다 (영어 발명품 실측 3건)", () => {
  assert.equal(isOwnActivitySentence("구텐베르크 활자 인쇄기는 활자를 배열해 종이에 글과 책을 인쇄하는 데 쓰였다."), false);
  assert.equal(isOwnActivitySentence("구텐베르크는 1448년경부터 금속 활자를 이용한 인쇄를 실험했다."), false);
  assert.equal(isOwnActivitySentence("이 인쇄기의 핵심에는 반복해서 쓸 수 있는 금속 활자가 있었다."), false);
  // 학생이 출력해서 붙인 것은 그대로 잡는다
  assert.equal(isOwnActivitySentence("기사를 출력해서 평가지에 붙였다."), true);
  assert.equal(isOwnActivitySentence("기사 제목과 날짜가 보이게 출력했다."), true);
  assert.equal(isOwnActivitySentence("지도를 인쇄해 오려 붙였다."), true);
});

test("사진·도구를 준비했다고 쓴 문장도 학생 행동을 지어낸 것이다(준비한다·준비할 것은 계획이라 제외)", () => {
  assert.equal(isOwnActivitySentence("논술용 사진과 제작용 사진은 각 유물마다 한 장씩 총 4장을 준비했다."), true);
  assert.equal(isOwnActivitySentence("채색 도구는 가정에서 준비했다."), true);
  assert.equal(isOwnActivitySentence("사진은 학생이 가정에서 출력해 준비한다."), false);
  assert.equal(isOwnActivitySentence("준비물은 사진 두 장이다."), false);
});
