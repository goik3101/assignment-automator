import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFormRequirements,
  buildFormLimitBlock,
  buildSceneBlock,
  checkFormRequirements,
  countParagraphs,
  countScenes,
  countSentences,
  expandSceneUnits,
  extractCountRequirements,
  type FormElement,
  hasSizeLimit,
  isSceneListElement,
  requirementsForElement,
  sceneBlockInputs,
} from "./form-requirements.ts";
import { lengthGuideLines, planLength } from "./length-plan.ts";
import { dropNonSubmissionActivities, dropNote, isObservationSheet, isScriptlessSpeech } from "../gemini/analysis-normalize.ts";

// 합성 안내문(화법과 작문 모둠 영상 발표)을 실제로 분석시킨 결과(2026-10-27, gpt-6-luna, 수정 전, n=1)를 그대로 옮긴 재현 자료.
// 실제 학교 안내문 원본은 저장소에 없다 — 이 자료는 "분석이 이렇게 돌려줄 때 생성 단계가 어떻게 되는가"를 재현한다.
const REQUIREMENTS = [
  "모둠 활동으로 진행",
  "스토리보드를 8장면으로 구성하고 장면마다 화면 설명과 대사(자막) 작성",
  "문제 상황과 해결 방안을 통계·사례 등의 근거와 함께 제시",
  "영상을 소개하는 발표 대본을 시험지 답안 칸(10줄) 안에 5문장 이내로 작성",
  "다른 모둠 발표를 들으며 발표 내용과 잘한 점을 청중 기록지에 작성",
];
const GUIDE = "스토리보드는 8장면으로 구성하고 장면마다 화면 설명과 대사(자막)를 넣는다. 문제 상황과 해결 방안은 통계·사례 등의 근거와 함께 제시한다. 발표 대본은 시험지 답안 칸 10줄 안에 5문장 이내로 작성한다. 청중 기록지에는 발표 내용과 잘한 점을 기록한다.";
const labels3 = ["스토리보드", "발표 대본", "청중 기록지"];
const STORYBOARD = {
  label: "스토리보드",
  description: "1분 홍보 영상의 스토리보드를 8장면으로 구성하고, 장면마다 화면 설명과 대사(자막)를 작성한다.",
  required_items: ["화면 설명", "대사(자막)"],
  items_format: "sections" as const,
};
const SCRIPT: FormElement = { label: "발표 대본", description: "기획한 영상을 소개하는 발표 대본을 작성한다." };
const AUDIENCE = {
  label: "청중 기록지",
  description: "다른 모둠이 발표할 때 청중으로서 듣고 기록지에 발표 내용과 잘한 점을 적는다. 수업 시간에 작성하여 즉시 제출한다.",
  required_items: ["발표 내용", "잘한 점"],
};

// ── 추출 ───────────────────────────────────────────────────
test("개수 조건: 장면 N, 문장 이내, 줄 안에, 범위, 이상", () => {
  assert.deepEqual(extractCountRequirements(["스토리보드를 8장면으로 구성"]), [{ unit: "scene", word: "장면", min: 8, max: 8 }]);
  const sheet = extractCountRequirements(["시험지 답안 칸(10줄) 안에 5문장 이내로 작성"]);
  assert.deepEqual(sheet.find((r) => r.unit === "sentence"), { unit: "sentence", word: "문장", min: 0, max: 5 });
  assert.deepEqual(sheet.find((r) => r.unit === "line"), { unit: "line", word: "줄", min: 0, max: 10 });
  assert.deepEqual(extractCountRequirements(["3~5문장으로 쓴다"]), [{ unit: "sentence", word: "문장", min: 3, max: 5 }]);
  assert.deepEqual(extractCountRequirements(["두 문단 이상"]), [{ unit: "paragraph", word: "문단", min: 2, max: 0 }]);
  assert.deepEqual(extractCountRequirements(["컷 6개 이상"]).length, 0); // 단위가 숫자 뒤에 올 때만
  assert.deepEqual(extractCountRequirements(["6컷 이상으로"]), [{ unit: "scene", word: "컷", min: 6, max: 0 }]);
});

test("한정어 없는 문장·줄·문단과 '한 문장'은 조건으로 보지 않는다(오탐 방지)", () => {
  assert.deepEqual(extractCountRequirements(["핵심을 한 문장으로 요약한다", "3문장으로 쓴다", "10줄"]), []);
});

test("재현: 실제 분석 결과에서 단계별 조건이 정확히 갈린다", () => {
  const sb = requirementsForElement(STORYBOARD, REQUIREMENTS, GUIDE, labels3);
  const sc = requirementsForElement(SCRIPT, REQUIREMENTS, GUIDE, labels3);
  assert.deepEqual(sb.filter((r) => r.unit === "scene"), [{ unit: "scene", word: "장면", min: 8, max: 8 }]);
  assert.equal(sb.some((r) => r.unit === "sentence"), false); // 발표 대본의 5문장 조건이 스토리보드에 새지 않는다
  assert.deepEqual(sc.filter((r) => r.unit === "sentence"), [{ unit: "sentence", word: "문장", min: 0, max: 5 }]);
  assert.equal(sc.some((r) => r.unit === "scene"), false);
  assert.equal(hasSizeLimit(sc), true);
  assert.equal(hasSizeLimit(sb), false);
});

test("단계가 하나뿐이면 이름을 언급하지 않은 조건도 그 단계 것이다", () => {
  const reqs = requirementsForElement({ label: "영상 기획", description: "영상을 기획한다" }, ["영상은 6컷으로 구성"], undefined, ["영상 기획"]);
  assert.deepEqual(reqs, [{ unit: "scene", word: "컷", min: 6, max: 6 }]);
  assert.deepEqual(requirementsForElement({ label: "영상 기획", description: "영상을 기획한다" }, ["영상은 6컷으로 구성"], undefined, ["영상 기획", "발표"]), []);
});

// ── 장면 목록: "8장면"이 칸 이름("화면 설명·대사")으로 쪼개지던 문제 ─────────
test("재현: 8장면 단계가 필수 항목 '화면 설명·대사' 2개로 쪼개지던 것을 장면 1~8로 바로잡는다", () => {
  assert.equal(isSceneListElement(STORYBOARD), false); // 수정 전: 항목이 칸 이름 2개뿐이라 장면 구조가 사라진다
  const out = expandSceneUnits(STORYBOARD, requirementsForElement(STORYBOARD, REQUIREMENTS, GUIDE, labels3));
  assert.deepEqual(out.required_items, ["장면 1", "장면 2", "장면 3", "장면 4", "장면 5", "장면 6", "장면 7", "장면 8"]);
  assert.equal(out.items_format, "sections");
  assert.match(out.description, /장면마다 화면 설명·대사\(자막\)를 쓴다/);
  assert.equal(isSceneListElement(out), true);
  assert.deepEqual(sceneBlockInputs([out]), [{ label: "스토리보드", word: "장면", n: 8, fields: "화면 설명·대사(자막)" }]);
});

test("이미 개수만큼 항목이 있으면(예: 카드뉴스 ①~⑥) 건드리지 않는다", () => {
  const cards = { label: "카드뉴스", description: "6칸으로 구성", required_items: ["①", "②", "③", "④", "⑤", "⑥"] };
  assert.equal(expandSceneUnits(cards, requirementsForElement(cards, [], undefined, ["카드뉴스"])), cards);
});

test("applyFormRequirements는 단계별로 펼치고 다른 단계는 그대로 둔다", () => {
  const info = { requirements: REQUIREMENTS, writing_guide: GUIDE, task_elements: [STORYBOARD, { ...SCRIPT }] };
  const out = applyFormRequirements(info);
  assert.equal(out.task_elements[0].required_items?.length, 8);
  assert.equal(out.task_elements[1], info.task_elements[1]);
  assert.equal(info.task_elements[0].required_items?.length, 2); // 원본은 바뀌지 않는다
});

test("장면 블록은 번호 소제목과 장면마다 쓸 칸을 지시한다", () => {
  const b = buildSceneBlock([{ label: "스토리보드", word: "장면", n: 8, fields: "화면 설명·대사(자막)" }]);
  assert.match(b, /"### 장면 1"부터 "### 장면 8"까지 8개/);
  assert.match(b, /화면 설명·대사\(자막\)/);
  assert.equal(buildSceneBlock([]), "");
});

// ── 기본 분량 충돌 ─────────────────────────────────────────
test("재현: 5문장 이내 조건이 있어도 기본 분량 가이드가 발표 900~1700자를 요구하던 것을 뺀다", () => {
  const before = lengthGuideLines([SCRIPT]); // ctx 없이 = 수정 전 동작
  assert.match(before[0], /발표 대본.*900~1[78]\d\d자|발표 대본.*공백 포함 9\d\d~1\d{3}자/);
  const ctx = { requirements: REQUIREMENTS, guide: GUIDE, labels: labels3 };
  assert.deepEqual(lengthGuideLines([SCRIPT], ctx), []);
});

test("장면 목록 단계의 기본 분량은 보고서 항목이 아니라 장면당 짧은 분량이다", () => {
  const el = expandSceneUnits(STORYBOARD, requirementsForElement(STORYBOARD, REQUIREMENTS, GUIDE, labels3));
  const p = planLength(el);
  assert.equal(p.role, "scenes");
  assert.deepEqual([p.min, p.max], [560, 1600]);
  const asReport = planLength({ ...el, required_items: ["가", "나", "다", "라", "마", "바", "사", "아"] });
  assert.equal(asReport.role, "report_sections");
  assert.ok(asReport.max > p.max); // 수정 전에는 항목 8개 × 250~450 = 2000~3600자를 요구했다
});

test("FORM_REQUIREMENTS=off면 예전 동작(기본 분량 그대로, 장면 역할 없음)", () => {
  process.env.FORM_REQUIREMENTS = "off";
  try {
    assert.equal(lengthGuideLines([SCRIPT], { requirements: REQUIREMENTS, guide: GUIDE, labels: labels3 }).length, 1);
    const el = { ...STORYBOARD, required_items: Array.from({ length: 8 }, (_, i) => `장면 ${i + 1}`) };
    assert.notEqual(planLength(el).role, "scenes");
  } finally {
    delete process.env.FORM_REQUIREMENTS;
  }
});

// ── 세기와 검사 ────────────────────────────────────────────
test("장면 세기: 소제목·컷 표지·원 숫자·표 행", () => {
  assert.equal(countScenes("### 장면 1\n화면\n### 장면 2\n화면\n### 장면 3\n"), 3);
  assert.equal(countScenes("컷 1: 교문\n컷 2: 복도\n컷 2: 복도 다시\n"), 2);
  assert.equal(countScenes("① 시작\n② 전개\n③ 끝"), 3);
  assert.equal(countScenes("| 장면 | 화면 |\n|---|---|\n| 1 | 교문 |\n| 2 | 복도 |"), 2);
  assert.equal(countScenes("화면은 밝다. 대사는 짧다."), 0);
});

test("문장 세기: 소제목·각주·초안 표시 제외, 소수점은 문장 끝이 아님", () => {
  assert.equal(countSentences("### 제목\n우리 학교 앞 횡단보도는 위험하다[1]. 신호가 3.5초밖에 안 된다. 개선이 필요하다!"), 3);
  assert.equal(countSentences("(학생 감상 초안 — 고쳐 쓰세요)\n첫 문장이다. 둘째 문장이다."), 2);
  assert.equal(countParagraphs("첫 문단이다.\n\n둘째 문단이다.\n\n### 소제목\n\n셋째 문단이다."), 3);
});

test("재현: 5문장 이내 조건을 어긴 발표 대본을 잡고, 지킨 글은 통과시킨다", () => {
  const reqs = requirementsForElement(SCRIPT, REQUIREMENTS, GUIDE, labels3);
  const long = "안녕하세요. 저희는 통학로 문제를 다룹니다. 횡단보도 신호가 짧습니다. 학생 사고가 늘고 있습니다. 해결 방안을 제안합니다. 신호 시간을 늘려야 합니다. 감사합니다.";
  const issues = checkFormRequirements(long, reqs);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].problem, "above");
  assert.equal(issues[0].actual, 7);
  const ok = "안녕하세요. 저희는 통학로 문제를 다룹니다. 횡단보도 신호가 짧아 사고가 늘고 있습니다. 신호 시간을 늘려야 합니다. 감사합니다.";
  assert.deepEqual(checkFormRequirements(ok, reqs), []);
});

test("줄 조건은 검사하지 않고, 장면 목록 단계는 장면 검사를 건너뛴다(필수 항목 검사가 맡는다)", () => {
  assert.deepEqual(checkFormRequirements("가나다. ".repeat(40), [{ unit: "line", word: "줄", min: 0, max: 10 }]), []);
  const scene = [{ unit: "scene" as const, word: "장면", min: 8, max: 8 }];
  assert.equal(checkFormRequirements("### 장면 1\n화면", scene).length, 1);
  assert.deepEqual(checkFormRequirements("### 장면 1\n화면", scene, { skipScene: true }), []);
});

test("형식 조건 블록: 해당 단계만, 조건이 다른 분량 지시보다 우선한다고 밝힌다", () => {
  const sb = requirementsForElement(STORYBOARD, REQUIREMENTS, GUIDE, labels3);
  const sc = requirementsForElement(SCRIPT, REQUIREMENTS, GUIDE, labels3);
  const block = buildFormLimitBlock([{ label: "스토리보드", reqs: sb }, { label: "발표 대본", reqs: sc }]);
  assert.match(block, /"발표 대본" 단계: (?:5문장 이내, 10줄 이내|10줄 이내, 5문장 이내)/);
  assert.doesNotMatch(block, /"스토리보드" 단계/); // 장면 수는 장면 블록이 맡는다
  assert.match(block, /다른 모든 분량 지시보다 우선/);
  assert.equal(buildFormLimitBlock([{ label: "스토리보드", reqs: sb }]), "");
});

// ── 수업 중 작성 기록지 ────────────────────────────────────
test("재현: 청중 기록지를 만들 결과물에서 빼고 나머지는 그대로 둔다", () => {
  const { kept, dropped } = dropNonSubmissionActivities([STORYBOARD, SCRIPT, AUDIENCE]);
  assert.deepEqual(kept.map((e) => e.label), ["스토리보드", "발표 대본"]);
  assert.deepEqual(dropped.map((e) => e.label), ["청중 기록지"]);
});

test("기록지뿐인 과제는 그대로 둔다 / 제출물인 활동지·학생 본인 평가는 빼지 않는다", () => {
  assert.equal(dropNonSubmissionActivities([AUDIENCE]).kept.length, 1);
  assert.equal(isObservationSheet({ label: "독서 활동지", description: "책을 읽고 줄거리와 느낀 점을 정리한다" }), false);
  assert.equal(isObservationSheet({ label: "자기 평가지", description: "본인의 활동을 돌아보며 쓴다" }), false);
  assert.equal(isObservationSheet({ label: "청중 분석", description: "내 발표를 들을 청중이 누구인지 분석한다" }), false);
  assert.equal(isObservationSheet({ label: "동료 평가지", description: "모둠원의 기여도를 평가한다" }), true);
  assert.equal(isObservationSheet({ label: "발표 관찰 활동지", description: "다른 모둠 발표를 보면서 잘한 점을 적는다" }), true);
});

// ── 실제 안내문(공통국어2 매체 활용 주제발표, 사진)을 분석시킨 결과(2026-10-27)에서 옮긴 재현 자료 ──
const REAL_SPEECH = { label: "매체 활용 의견 발표", description: "찬반을 세트로 하여 의견을 발표한다. 그림 자료를 활용하고 대본 없이 자연스럽게 말한다." };
const REAL_OUTLINE: FormElement = { label: "개요", description: "글의 목적·주제·예상 독자를 설정하고, 중심 내용과 세부 내용을 구상한다." };
const REAL_BOARD: FormElement = { label: "스토리보드", description: "개요에서 생성한 내용을 바탕으로 8개의 장면으로 스토리보드를 작성한다. 장면은 간단히 표시하고, 전체 내용의 통일성과 응집성, 적절한 흐름을 갖춘다." };

test("재현: 대본 없이 말하는 발표는 만들 결과물에서 빼고, 개요·스토리보드는 남긴다", () => {
  const { kept, dropped } = dropNonSubmissionActivities([REAL_OUTLINE, REAL_BOARD, REAL_SPEECH], ["발표 시 대본 없이 자연스럽게 말한다."]);
  assert.deepEqual(kept.map((e) => e.label), ["개요", "스토리보드"]);
  assert.deepEqual(dropped.map((e) => e.label), ["매체 활용 의견 발표"]);
  assert.match(dropNote(REAL_SPEECH), /대본 없이 말하기/);
});

test("대본 작성 단계나 발표 자료 단계는, 대본이 없다는 말이 있어도 빼지 않는다", () => {
  assert.equal(isScriptlessSpeech({ label: "발표 대본", description: "대본 없이 발표하기 위한 키워드 메모" }, ["대본은 없어야 한다"]), false);
  assert.equal(isScriptlessSpeech({ label: "발표 자료 제작", description: "슬라이드를 만든다" }, ["대본 없이 발표"]), false);
  assert.equal(isScriptlessSpeech({ label: "의견 발표", description: "의견을 말로 발표한다" }, ["대본을 읽지 않고 말한다"]), true);
  assert.equal(isScriptlessSpeech({ label: "의견 발표", description: "의견을 말로 발표한다" }, ["시간은 3분"]), false);
  assert.equal(isScriptlessSpeech({ label: "의견 발표", description: "의견을 말로 발표한다" }, ["대본은 없어야 하며"]), true);
});

test("재현: 실제 안내문의 '8개의 장면'이 장면 1~8 필수 항목이 되고, 개요의 출처 항목은 그대로다", () => {
  const info = {
    requirements: ["개요에서 생성한 내용을 바탕으로 8개의 장면으로 스토리보드를 작성한다. 8개가 기본이며 10개까지 가능하고, 8개보다 부족하면 감점된다."],
    task_elements: [{ ...REAL_OUTLINE, required_items: ["글의 목적·주제·예상 독자", "중심 내용과 세부 내용", "근거 정보 3가지 이상", "출처"] }, REAL_BOARD],
  };
  const out = applyFormRequirements(info);
  assert.equal(out.task_elements[1].required_items?.length, 8);
  assert.equal(out.task_elements[1].required_items?.[7], "장면 8");
  assert.equal(out.task_elements[0].required_items?.length, 4); // 개요에는 장면 조건이 새지 않는다
});

test("재현: '스토리보드는 개요의 내용을 바탕으로 8개의 장면을 구성'에서 8장면은 개요가 아니라 스토리보드 조건이다", () => {
  const guide = "개요는 글의 목적·주제·예상 독자를 구분해 작성한다. 스토리보드는 개요의 내용을 바탕으로 8개의 장면을 구성하며(10개까지 가능), 장면 간 흐름이 자연스럽게 한다.";
  const labels = ["개요", "스토리보드"];
  const outline: FormElement = { ...REAL_OUTLINE, description: "글의 목적·주제·예상 독자를 설정하고 중심 내용과 세부 내용을 구상하는 개요를 작성한다." };
  const board: FormElement = { label: "스토리보드", description: "개요의 내용을 바탕으로 장면을 구성한다." }; // 설명에는 개수가 없는 경우
  assert.deepEqual(requirementsForElement(outline, [], guide, labels), []);
  assert.deepEqual(requirementsForElement(board, [], guide, labels).map((r) => [r.unit, r.min]), [["scene", 8]]);
  const out = applyFormRequirements({ requirements: [], writing_guide: guide, task_elements: [outline, board] });
  assert.equal(out.task_elements[0].required_items, undefined);
  assert.equal(out.task_elements[1].required_items?.length, 8);
});
