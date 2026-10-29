import { cleanMarkers } from "./citation-cleanup";
import { generate } from "@/lib/llm";
import { currentSourceScope } from "@/lib/llm/scope";
import { isDomesticUrl, keepInScope } from "@/lib/essay/source-scope";
import { needsFactSearch } from "@/lib/llm/search-policy";
import { collectUserNumbers, findStatClaimCandidates } from "./stat-claims";
import {
  ANTI_AI_TONE_RULES,
  NO_META_COMMENTARY_RULE,
  NO_REFERENCE_LIST_RULE,
  sourceEconomyRule,
  PERSPECTIVE_RULE,
  MULTI_DELIVERABLE_SEPARATION_RULE,
  FACTUAL_RIGOR_RULES,
  ACHIEVEMENT_INTERPRETATION_RULES,
  FORM_FIDELITY_RULES,
  writingGuideBlock,
} from "./prompts";
import { formRequirementsOn, qualityFixesOn } from "@/lib/essay/quality-flags";
import { applyFormRequirements, buildFormLimitBlock, checkFormRequirements, isSceneLikeElement, isSceneListElement, requirementsForElement } from "@/lib/essay/form-requirements";
import { hasVerifiableClaimText } from "@/lib/essay/verifiable-claims";
import { formWarningText, repairFormRequirements } from "@/lib/essay/form-repair";
import { renderScopedGuide, scopedLinesFor } from "@/lib/essay/requirement-scope";
import { buildSourceList, insertCitationMarkers, stripInvalidCitationMarkers, tidyOutputText } from "./citations";
import {
  extractYears,
  findMissingItems,
  parseResearchItems,
  yearsMissingFromResearch,
} from "@/lib/research/research-items";
import { validateSources } from "@/lib/links/validate-sources";
import { verifyExcerpt, isWeakQuoteSource, STATISTIC_OR_NEWS_QUERY_TEMPLATES } from "@/lib/verification/excerpt-verification";
import { stripClichesFromText, stripUnsupportedSuperlatives, stripFakeReferenceList, researchForTask, factSheetRules, writeEffort, type ResearchNotes } from "./generate-essay";
import { attachFactMarkers, factSheetText, factsFromCitedText, mapFactMarkers } from "@/lib/essay/research-notes";
import { fixJosaAfterTitle, reduceReportedSpeech, stripInlineUrls, stripOrdinalEnumerators, stripMetaNoteLines, stripModelReferenceBlock, stripWorkNotes } from "@/lib/essay/deliverable";
import { limitSources, requiredSourceCount } from "@/lib/essay/source-select";
import { promptRuleScope } from "@/lib/essay/prompt-scope";
import type { CoreTaskInfo, PlanResult, ProductionStep, SourceRef, InsufficientDataResult } from "@/types/task";
import { currentOutputLang } from "@/lib/llm/output-lang";
import { compactName } from "@/lib/selection/canonical";

// 사용자 요청(2026-09-13): 예전엔 이 경로가 "무엇을 조사/작성할지"만 안내하는
// 실행 계획(할 일 목록)을 만들었다 — PPT/포스터/신문처럼 외부 툴이나 물리적
// 제작이 필요한 산출물이라도, 글로 쓸 수 있는 부분(기사문, 슬라이드 문구,
// 포스터 헤드라인, 사설/칼럼, 발표 대본 등)은 실제로 완성해서 주지 않고
// "이런 걸 조사해서 써라"는 계획만 줬다. 이제는 글로 쓸 수 있는 부분은 전부
// 지금 완성해서 주고(완성 원고 경로와 동일한 방식: 그라운딩 켠 자유 텍스트 +
// 바이트 단위 각주 삽입), 학생이 정말 손으로 직접 해야 하는 물리적 제작
// 단계(그림 그리기, 배치, 오려붙이기, 색칠, 인쇄 등)만 짧은 체크리스트로
// 남긴다. 이렇게 바꾸면서 예전에 필요했던 "1차 자유 텍스트 → 2차 JSON 변환"
// 2단계 구조도 함께 없앴다 — 두 섹션 모두 모델이 지정된 "## 제목" 아래
// 자연스러운 텍스트/번호목록으로 쓰게 하고, 코드가 순수 문자열 처리로
// 나눠 담는다(완성 원고 경로에서 "모델이 텍스트를 그대로 옮겨 적다가 글자를
// 빠뜨리는" 사고를 겪은 뒤 확립한 원칙 — splitAnnotatedIntoSections 참고 —
// 을 그대로 적용: annotated 텍스트에서 직접 슬라이스하고, 물리적 제작
// 체크리스트의 예상 소요시간(정수)도 모델이 낸 JSON 필드가 아니라 원문에
// "N분"으로 쓰인 걸 정규식으로 그대로 읽어서 파싱한다).

export interface GeneratePlanInput {
  subject: string;
  coreTaskInfo: CoreTaskInfo;
  instructions?: string;
  avoidanceInstruction?: string;
  personalization?: string;
  /** F6 재생성 시 학생이 입력하는 "이번엔 이렇게 고쳐줘" 방향 (9-5) */
  revisionInstructions?: string;
  /** F6 재생성 시 이전 버전의 실제 결과 텍스트 (generate-essay.ts와 동일한 목적). */
  previousOutputText?: string;
  /**
   * 추천 다양성 시스템(5단계) — generate-essay.ts의 recentBookGuidance와 같은
   * 역할이지만 카테고리가 statistic/case_example이다. 새 회피 로직을 따로
   * 만들지 않고 recommendation-diversity.ts를 그대로 재사용한다.
   */
  recentStatGuidance?: string;
  /**
   * 인물 혼입 버그 방지: 같은 수행평가에 text_submission(완성 원고) 요소가
   * 함께 있고, 거기서 이미 인물/사건 등을 자유롭게 선정해 확정했다면
   * (generate-essay.ts의 EssayResult.confirmedSubject) 그 값을 그대로 받아
   * 실행 계획도 같은 대상만 다루도록 고정한다. essay와 plan은 서로 다른
   * API 호출로 독립 생성되기 때문에, 이 값이 없으면 각자 다른 인물/자료를
   * 자유롭게 골라버려서 완전히 다른 내용이 섞이는 문제가 실제로 있었다.
   */
  fixedSubject?: string;
  /**
   * 날짜/숫자 불일치 방지: 같은 과제의 완성 원고(text_submission)가 먼저
   * 생성되었다면 그 전체 텍스트(EssayResult.markdown)를 그대로 받는다.
   * fixedSubject가 "누구"를 고정한다면, 이건 "그 사람에 대해 이미 확정한
   * 구체적 사실(출생/사망 연도, 숫자 등)"을 고정한다 — essay와 plan은 서로
   * 다른 검색 그라운딩 호출이라, 같은 인물이어도 예를 들어 사망 연도가
   * 자료 수집=1931년/신문 제작=1932년처럼 서로 다르게 나올 수 있다.
   * previousOutputText(재생성 연속성용)와는 목적이 달라 별도 필드로 둔다 —
   * 이건 "같은 문서를 이어쓰기"가 아니라 "다른 형식의 새 글인데 사실만
   * 맞추기"라서, 원문을 그대로 베끼거나 같은 구조로 쓰면 안 된다.
   */
  referenceFactsText?: string;
  /** referenceFactsText(완성 원고)의 출처 목록 — 있으면 원고의 각주 문장을 사실 노트로 써서 조사(검색)를 다시 하지 않는다. */
  referenceSources?: SourceRef[];
  /**
   * 만들 외부 제작 요소의 이름. 화면은 외부 제작 요소마다 이 경로를 한 번씩 부르는데, 예전에는 몇 번을 불러도
   * 첫 번째 요소만 만들었다 — 요소가 N개면 같은 계획을 N번 만들어(비용 N배) 2번째부터는 엉뚱한 내용이 보였다.
   * 없으면 예전처럼 첫 번째 외부 제작 요소.
   */
  elementLabel?: string;
}

function targetElement(input: GeneratePlanInput) {
  const external = input.coreTaskInfo.task_elements.filter((e) => e.type === "external_production");
  return (input.elementLabel ? external.find((e) => e.label === input.elementLabel) : undefined) ?? external[0];
}

const CONTENT_HEADING = "## 완성된 글";
const PHYSICAL_HEADING = "## 직접 만들어야 할 것";

/** 이 산출물(external_production)이 안내문에서 요구받은 필수 항목 — 조사·탐구형
 * ("sections")일 때만 "### 항목" 구조와 누락 검사를 적용한다. */
function planRequiredItems(input: GeneratePlanInput): string[] | undefined {
  const element = targetElement(input);
  if (!element || (element.required_items?.length ?? 0) < 2) return undefined;
  return element.required_items;
}

/** 자료 수집(essay)에서 확정된 조사 자료를 "항목별 사실" 목록 + 연도 목록으로
 * 다시 정리해 프롬프트에 넣는다 — 신문 제작이 인물·연도·사건을 독립적으로 다시
 * 만들어내지 않고 이 확정 사실을 재사용하게 하는 단일 진실 소스. */
function formatResearchFacts(referenceFactsText: string): string | null {
  const items = parseResearchItems(referenceFactsText);
  if (items.length === 0) return null;
  const years = extractYears(referenceFactsText);
  return (
    items.map((it) => `[${it.item}]\n${it.lines.join("\n")}`).join("\n\n") +
    (years.length ? `\n\n[확정된 연도 목록] ${years.join(", ")}` : "")
  );
}

// 독후 활동(학생이 읽은 책이 지침에 있음): 실측(2026-10-22, 카드뉴스·《사일구》)에서 책 내용 없이 백과사전식 4·19 개요만 나왔다.
const BOOK_IN_INSTRUCTIONS = /[《『]([^》』]{1,60})[》』]/;
function studentBookFromInstructions(instructions?: string): string | null {
  const m = instructions ? BOOK_IN_INSTRUCTIONS.exec(instructions) : null;
  return m ? m[1].trim() : null;
}
function bookBasedBlock(title: string): string {
  return `
[학생이 읽은 책 — 이 산출물의 바탕] 《${title}》
- 이 산출물은 학생이 읽은 이 책의 독후 활동이다. 책의 줄거리·인물·장면(사건이 일어나는 순서)을 바탕으로 만들 것 — 역사적 배경 설명은 책 내용을 이해시키는 데 필요한 만큼만.
- 책 내용(줄거리·등장인물·주요 장면)은 검색으로 확인하고, 책에 없는 장면·대사를 지어내지 말 것. 확인한 책 정보에는 각주를 붙일 것.
`;
}
// 번호 칸·컷으로 된 양식(카드뉴스·네 컷 만화 등)
const PANEL_ITEM = /^\s*(?:패널|칸|컷|장면|카드|슬라이드)?\s*[①-⑳]|^\s*(?:패널|칸|컷|장면|카드)\s*\d+|^\s*\d+\s*(?:칸|컷|번\s*칸)/;
function panelBlock(items: string[]): string {
  return `
[칸 구성 — ${items.length}칸 모두 채울 것] 칸마다 아래 두 줄을 쓸 것.
- 그림: 학생이 손으로 그리기 쉬운 단순한 장면 하나(인물 1~2명과 배경·소품 한두 가지). 사진 인쇄·복잡한 구도를 요구하지 말 것.
- 들어갈 말: 그 칸 아래에 쓸 1~2문장(대략 30~60자). 칸끼리 이어 읽으면 한 편의 이야기·뉴스가 되게 쓸 것.
`;
}

function buildStepAPrompt(input: GeneratePlanInput, notes: ResearchNotes | null = null): string {
  const element = targetElement(input);
  const requiredItems = planRequiredItems(input);
  const structuredFacts = input.referenceFactsText ? formatResearchFacts(input.referenceFactsText) : null;
  const fixes = qualityFixesOn();
  const readBook = studentBookFromInstructions(input.instructions);
  const panelItems = (requiredItems ?? element?.required_items ?? []).filter((i) => PANEL_ITEM.test(i));
  // 완성 원고와 같은 기준으로 과제에 해당하는 공통 규칙만 넣는다(essay/prompt-scope.ts).
  const scope = promptRuleScope({
    subject: input.subject,
    texts: [input.coreTaskInfo.topic, ...input.coreTaskInfo.requirements, element?.label ?? "", element?.description ?? "", input.instructions ?? ""],
    hasPresetSubject: !!input.fixedSubject,
  });
  // 이 산출물에 걸리는 요구사항·작성 기준만 준다(다른 결과물이나 발표 방식 조건은 섞지 않는다 — requirement-scope.ts).
  const scoped = element && formRequirementsOn();
  const requirementsText = scoped
    ? scopedLinesFor(element.label, input.coreTaskInfo.requirements, input.coreTaskInfo.task_elements, [element.label]).map((r) => `- ${r}`).join("\n") || "(명시된 요구사항 없음)"
    : input.coreTaskInfo.requirements.map((r) => `- ${r}`).join("\n") || "(명시된 요구사항 없음)";
  const guideText = scoped ? renderScopedGuide(input.coreTaskInfo.writing_guide, input.coreTaskInfo.task_elements, [element.label]) : input.coreTaskInfo.writing_guide;
  const itemsBlock = requiredItems
    ? `
【필수 항목 구조 — 반드시 지킬 것】 이 산출물은 안내문이 요구한 다음 항목을 모두 포함해야 한다:
${requiredItems.join(" → ")}
"${CONTENT_HEADING}" 아래에서 각 항목마다 "### "로 시작하는 소제목 부분을 하나씩 둘 것 — 소제목에는 항목명의
핵심 단어가 그대로 들어가야 하고(신문이면 "### 인물의 생애 배경 — 헤드라인"처럼 기사 제목을 덧붙여도 됨),
그 아래에 그 항목의 실제 내용을 쓸 것. 항목을 빼거나 소제목만 쓰고 비워두지 말 것. 학생 본인의 생각·감상을
요구하는 항목(인상 깊었던 점, 교훈 등)은 소제목 바로 아래 첫 줄에 "(학생 감상 초안 — 본인 생각에 맞게 고쳐
쓰세요)"라고 표시하고 초안을 쓸 것 — 학생이 실제로 하지 않은 경험(직접 방문, 직접 인터뷰 등)이나 밝힌 적 없는
감정을 사실처럼 지어내지 말 것.
`
    : "";

  const continuityBlock = input.previousOutputText
    ? `
【중요 — 반드시 지킬 것】
아래 [이전 버전]은 이전 단계에서 이미 확정된 내용이다. 등장인물 이름, 고민·사연의
구체적 내용(장소·상황·세부사항), 이미 처방/선택한 책의 제목·저자·구절 등 이미
정해진 구체적 사실은 절대 바꾸거나 새로 지어내지 말고 그대로 이어서 사용할 것.
오직 아래 [재생성 요청]에서 명시적으로 요청한 부분만 그 사실 위에서 수정할 것.

[이전 버전]
${input.previousOutputText}
`.trim() + "\n\n"
    : "";

  return `
${continuityBlock}너는 한국 고등학생의 수행평가 준비를 돕는 도우미다.
아래 과제는 PPT/포스터/신문처럼 외부 툴이나 물리적 제작이 필요한 산출물이다.
글로 쓸 수 있는 내용(기사문, 슬라이드에 들어갈 문구, 포스터 헤드라인·본문,
사설·칼럼, 발표 대본 등)은 "이런 걸 조사해서 써라"는 계획만 세우지 말고,
지금 실제로 전부 완성해서 써줘 — 학생이 그대로 옮겨 적거나 인쇄해서 쓸 수
있는 수준으로. 오직 학생이 직접 손으로 해야 하는 부분(그림 그리기, 사진
배치, 오려붙이기, 색칠, 인쇄, 발표 리허설 등 글로 대신할 수 없는 물리적
작업)만 별도로 안내해줘 — 이런 물리적 작업까지 대신 써주지 마라.

[과목] ${input.subject}
[과제 주제] ${input.coreTaskInfo.topic}
[요구사항]
${requirementsText}
${input.elementLabel && element ? `[만들 요소] ${element.label} — 이번에는 이 요소 하나만 만들 것. 같은 과제의 다른 요소(${input.coreTaskInfo.task_elements.filter((e) => e.label !== element.label).map((e) => `"${e.label}"`).join(", ") || "없음"})는 따로 만들어지니 여기 쓰지 말 것.\n` : ""}[이 요소에 대한 설명] ${element?.description ?? ""}
${
  input.fixedSubject
    ? `
【절대 규칙 — 반드시 지킬 것】 이 과제는 이미 이전 단계에서 다음 대상 하나로
확정되었다: "${input.fixedSubject}". 이 글은 반드시 이 대상 하나만 다룬다.
다른 인물·사건·자료를 새로 선정하거나 검토 대상으로 언급하지 않는다. "만약
다른 X를 선택했다면", "X 대신 Y를 고른다면"처럼 다른 대상을 전제로 한
조건문도 절대 쓰지 않는다. 검색어와 통계·자료도 전부 "${input.fixedSubject}"와
직접 관련된 것만 쓴다.`
    : ""
}
${
  input.referenceFactsText
    ? `
【사실 일관성 규칙 — 반드시 지킬 것】 아래 [이미 확정된 자료]는 같은 과제의
다른 단계(자료 수집)에서 이미 검색해 확정한 내용이다. 여기 나온 인물 이름,
출생·사망 연도, 나이, 숫자, 사건 순서 등 구체적 사실은 이 글에서도 반드시
동일하게 유지할 것 — 이번에 새로 검색해서 다른 값이 나오더라도 이미 확정된
이 사실을 우선한다. 단, 이 글은 그 자료를 이어쓰는 게 아니라 신문 기사·
슬라이드 등 완전히 다른 형식의 새 글이니, 문장을 그대로 베끼거나 같은
구조로 쓰지 말고 이 산출물 형식에 맞게 새로 쓸 것.
이 글에 쓰는 인물·연도·사건·수치·성과는 아래 자료에서 가져오는 것이 원칙이다 — 아래
자료에 없는 새 연도나 수치를 이 글에서 새로 만들어 쓰지 말 것(꼭 필요하면 검색으로
확인하고 [n] 각주를 붙이되, 아래 자료의 사실과 충돌하면 안 된다). "(해석)" 표시가 붙은
줄과 "학생 감상 초안"은 확정된 사실이 아니라 해석·초안이니 사실처럼 단정하지 말 것.
아래 자료가 항목별(활동/성과/영향 등)로 나뉘어 있으면 그 층위를 이 글에서도 섞지 말 것.

[이미 확정된 자료]
${structuredFacts ?? input.referenceFactsText}
`.trim()
    : ""
}
${itemsBlock}
${fixes ? writingGuideBlock(guideText) : ""}${element && formRequirementsOn() ? buildFormLimitBlock([{ label: element.label, reqs: requirementsForElement(element, input.coreTaskInfo.requirements, input.coreTaskInfo.writing_guide, input.coreTaskInfo.task_elements.map((e) => e.label)) }]) : ""}${fixes && readBook ? bookBasedBlock(readBook) : ""}${fixes && panelItems ? panelBlock(panelItems) : ""}
${input.instructions ? `[학생이 추가로 입력한 지침]\n${input.instructions}` : ""}
${input.avoidanceInstruction ? `[다양성 확보를 위한 회피 지시 — 반드시 반영할 것]\n${input.avoidanceInstruction}` : ""}
${input.recentStatGuidance ? `\n${input.recentStatGuidance}\n` : ""}
${input.personalization ? `[학생 개인화 정보 — 자연스럽게 녹여낼 것]\n${input.personalization}` : ""}
${input.revisionInstructions ? `[재생성 요청 — 학생이 이전 결과물에 만족하지 못해 다시 요청함. 아래 방향을 반드시 반영해 새로 작성할 것]\n${input.revisionInstructions}` : ""}

${notes ? "" : `필요한 사실(통계, 사례, 원문 정보 등)은 반드시 실시간 검색으로 확인하고,
확인이 안 되면 지어내지 말 것.

【통계·사례·원문 검색은 한 번의 포괄적 검색으로 뭉뚱그리지 말 것 — 매우 중요】
구체적인 통계 수치나 사례를 인용할 계획이라면, "키워드 + 통계/사례" 정도로
한 번만 검색하고 멈추지 말고 서로 다른 각도로 여러 번 시도할 것 — 예를 들어:
${STATISTIC_OR_NEWS_QUERY_TEMPLATES.map((q, i) => `  ${i + 1}. ${q({ name: "<검색 키워드>", attribution: "<기관명>" })}`).join("\n")}
위키형 페이지(나무위키, 위키백과 등)나 동영상 자막만으로 확인하고 끝내지 말고,
가능하면 보도자료 원문·공공기관 발표자료·논문처럼 원자료 자체를 보여주는
페이지를 우선 찾을 것.
`}
【출력 형식 — 반드시 아래 두 제목을 정확히 이 글자 그대로(토씨 하나 바꾸거나
꾸미지 말고) 써서 나눌 것. 이 두 개 외에 다른 "## " 제목은 쓰지 말 것】

${CONTENT_HEADING}
(여기에 실제로 완성된 글 전체를 써줘. 검색으로 확인한 사실에는 각주를 붙여줘.
여러 부분(예: 헤드라인/기사/사설, 또는 슬라이드별)이 있으면 자연스러운
소제목으로 구분해도 되지만 "## "는 쓰지 말 것.)

${PHYSICAL_HEADING}
(여기에는 학생이 손으로 직접 해야 하는 작업만, "번호. (예상 N분) 할 일" 형식으로
한 줄씩 써줘 — 예: "1. (40분) 신문 1면에 들어갈 인물 초상화를 손그림으로
그리기". 조사나 글쓰기는 이미 위에서 다 끝났으니 여기에 다시 넣지 말 것. 학생이
아직 하지 않은 일이므로 반드시 "그린다/그리기", "배치한다/배치하기"처럼 할 일
형태로만 쓰고, "그렸다", "완성했다", "배치했다"처럼 이미 끝난 것처럼 쓰지 말 것
— 실제로 제작이 끝난 게 아니라 지금부터 학생이 직접 해야 할 계획이다.)

위 두 제목 줄은 반드시 "${CONTENT_HEADING}"과 "${PHYSICAL_HEADING}"을 한
글자도 바꾸지 않고 그대로 써야 한다("완성된 시대저널"처럼 꾸미지 말 것) —
코드가 이 줄을 기준으로 텍스트를 기계적으로 나누기 때문이다.
${ANTI_AI_TONE_RULES}
${fixes ? FORM_FIDELITY_RULES : ""}
${scope.factualRigor ? FACTUAL_RIGOR_RULES : ""}
${scope.achievement ? ACHIEVEMENT_INTERPRETATION_RULES : ""}
${NO_META_COMMENTARY_RULE}
${NO_REFERENCE_LIST_RULE}
${notes ? "" : sourceEconomyRule(requiredSourceCount([...input.coreTaskInfo.requirements, ...input.coreTaskInfo.task_elements.map((e) => e.description)]))}
${scope.personAndPerspective ? PERSPECTIVE_RULE : ""}
${MULTI_DELIVERABLE_SEPARATION_RULE}
${currentOutputLang() === "en" ? `
【출력 언어 — 반드시 지킬 것】 "${CONTENT_HEADING}"·"${PHYSICAL_HEADING}" 두 제목 줄은 한 글자도 바꾸지 말고 그대로 두고, 그 아래의 모든 내용(문구·설명·제작 단계)은 자연스러운 영어로만 쓸 것. 한국어 문장을 섞지 말 것.
` : ""}
${notes ? `${factSheetRules()}

[사실 노트]
${factSheetText(notes.facts)}` : ""}
`.trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 실제로 관찰된 문제: 모델이 지정한 제목을 정확히 안 쓰고 "## 완성된
// 시대저널"처럼 꾸며 쓰는 경우가 있었다(프롬프트에 "정확히 이 글자 그대로"를
// 강조해도 100% 보장은 안 된다는, 이 프로젝트에서 반복 확인된 패턴). 그래서
// 정확히 일치하는 제목이 없으면, 그 제목을 대표하는 핵심 단어가 들어간
// "## "로 시작하는 줄을 대신 찾는 완화된 매칭으로 한 번 더 시도한다.
// "###" 항목 소제목이 "완성"/"직접...만들" 같은 단어를 우연히 포함해도 오인하지
// 않도록 "##" 바로 뒤에 "#"이 오지 않는 줄만 대상으로 한다.
const CONTENT_HEADING_FUZZY = /^##(?!#).*완성.*$/m;
const PHYSICAL_HEADING_FUZZY = /^##(?!#).*(직접|손으로).*(만들|제작|작업).*$/m;

/** annotated(각주까지 삽입된 원문)에서 CONTENT_HEADING/PHYSICAL_HEADING 두
 * 제목을 기준으로 순수 문자열 slice만 한다 — 모델에게 다시 옮겨 적으라고
 * 시키지 않으므로 글자 손실이 구조적으로 불가능하다(generate-essay.ts의
 * splitAnnotatedIntoSections와 같은 이유). */
function splitContentAndPhysicalText(annotated: string): { content: string; physicalText: string } {
  const contentRe = new RegExp(`^${escapeRegExp(CONTENT_HEADING)}[ \\t]*$`, "m");
  const physicalRe = new RegExp(`^${escapeRegExp(PHYSICAL_HEADING)}[ \\t]*$`, "m");

  const contentMatch = contentRe.exec(annotated) ?? CONTENT_HEADING_FUZZY.exec(annotated);
  const physicalMatch = physicalRe.exec(annotated) ?? PHYSICAL_HEADING_FUZZY.exec(annotated);

  if (!contentMatch) {
    // 모델이 지정된 제목을 못 지켰으면(드물게라도) 전체를 완성된 글로 취급하고
    // 물리적 체크리스트는 비워둔다 — 조용히 빈 결과를 내보내는 것보다 낫다.
    console.warn(`[generatePlan] "${CONTENT_HEADING}" 제목을 찾지 못함 — 전체를 완성된 글로 취급`);
    return { content: annotated.trim(), physicalText: "" };
  }

  const contentStart = contentMatch.index + contentMatch[0].length;
  const contentEnd = physicalMatch ? physicalMatch.index : annotated.length;
  const content = annotated.slice(contentStart, contentEnd).trim();

  if (!physicalMatch) {
    console.warn(`[generatePlan] "${PHYSICAL_HEADING}" 제목을 찾지 못함 — 물리적 체크리스트 없이 진행`);
    return { content, physicalText: "" };
  }

  const physicalText = annotated.slice(physicalMatch.index + physicalMatch[0].length).trim();
  return { content, physicalText };
}

const PHYSICAL_STEP_LINE_PATTERN = /^\s*\d+[.)]\s*(?:\((\d+)\s*분\)\s*)?(.+)$/;
const DEFAULT_PHYSICAL_STEP_MINUTES = 20;

/** 물리적 제작 체크리스트를 정규식으로 파싱한다 — 예상 소요시간(정수)을
 * 모델이 낸 구조화 필드가 아니라 "N분" 형태의 원문 텍스트에서 그대로
 * 읽어온다(정수 계산을 모델에게 맡기면 드물게 토큰 반복 루프에 빠지는
 * 사고를 analyze.ts에서 겪은 뒤 확립한 원칙, PROGRESS.md 참고). */
function parseProductionSteps(physicalText: string): ProductionStep[] {
  const lines = physicalText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const steps: ProductionStep[] = [];
  let order = 1;
  for (const line of lines) {
    const m = PHYSICAL_STEP_LINE_PATTERN.exec(line);
    if (!m) continue;
    steps.push({
      order: order++,
      task: m[2].trim(),
      estimated_minutes: m[1] ? Number(m[1]) : DEFAULT_PHYSICAL_STEP_MINUTES,
    });
  }
  return steps;
}

// 완성된 글에 등장하는 통계/수치 주장에 각주가 없으면 검증 없이 지어낸 것으로 의심한다. 무엇을 "외부 통계 주장"으로 볼지는
// stat-claims.ts에서 (사용자 가정값 / 계산·표 / 외부 주장)으로 나눠 판단한다.
function findUnverifiedStatClaim(
  content: string,
  sourceById: Map<number, SourceRef>,
  opts: { userNumbers: Set<string>; strictExternalOnly: boolean }
): { afterEnd: number; sentence: string } | null {
  for (const cand of findStatClaimCandidates(content, opts)) {
    const trailingWindow = content.slice(cand.afterEnd, cand.afterEnd + 60);
    const citedNs = Array.from(trailingWindow.matchAll(/\[(\d+)\]/g), (mm) => Number(mm[1]));
    const hasTrustworthyCitation = citedNs.some((n) => {
      const src = sourceById.get(n);
      return src && !isWeakQuoteSource(src.url);
    });
    if (!hasTrustworthyCitation) return { afterEnd: cand.afterEnd, sentence: cand.sentence };
  }
  return null;
}

export async function generatePlan(
  input: GeneratePlanInput
): Promise<PlanResult | InsufficientDataResult> {
  const start = Date.now();
  // 안내문의 개수 조건("8장면")은 필수 항목("장면 1…8")으로 펼친다(생성 시점에만 — form-requirements.ts).
  if (formRequirementsOn()) input = { ...input, coreTaskInfo: applyFormRequirements(input.coreTaskInfo) };

  const wantSearch = needsFactSearch(
    input.coreTaskInfo.topic,
    ...input.coreTaskInfo.requirements,
    ...input.coreTaskInfo.task_elements.flatMap((e) => [e.label, e.description]),
    input.instructions
  );
  // 조사 → 글쓰기(완성 원고 경로와 같은 방식): 검색은 조사 호출에서만 하고, 글쓰기는 사실 노트의 [F번호]로만 근거를 단다 — 출처를 코드가 붙인다.
  // 실측(2026-10-22): 한 번 호출 방식은 모델이 링크 대신 "(제주4·3평화재단)" 같은 글자만 써서 출처 0개, 또는 본문에 주소를 남겼다.
  // 조사가 실패하면(사실 4개 미만 등) 예전 한 번 호출 방식으로 돌아간다. PLAN_PIPELINE=legacy면 항상 예전 방식.
  let notes: ResearchNotes | null = null;
  let reusedEssayFacts = false;
  if (wantSearch && qualityFixesOn() && process.env.PLAN_PIPELINE !== "legacy") {
    const element = targetElement(input);
    const book = studentBookFromInstructions(input.instructions);
    // 같은 과제의 완성 원고가 이미 확인한 사실(각주 문장)이 충분하면 그것으로 쓴다 — 사실이 원고와 어긋나지도 않는다. PLAN_REUSE_ESSAY_FACTS=off로 끈다.
    const reused =
      input.referenceFactsText && input.referenceSources?.length && process.env.PLAN_REUSE_ESSAY_FACTS !== "off"
        ? factsFromCitedText(input.referenceFactsText, keepInScope(input.referenceSources, currentSourceScope()))
        : [];
    if (reused.length >= 4) {
      notes = { facts: reused, queries: [] };
      reusedEssayFacts = true;
      console.log(`[generatePlan] 완성 원고의 사실 ${reused.length}개 재사용 — 조사 생략`);
    } else notes = await researchForTask(
      {
        subject: input.subject,
        coreTaskInfo: { ...input.coreTaskInfo, task_elements: element ? [element] : input.coreTaskInfo.task_elements },
        instructions: input.instructions,
        presetBook: book ? { title: book } : undefined,
        presetSubject: input.fixedSubject ? { name: input.fixedSubject, key: input.fixedSubject } : undefined,
      },
      element ? [element] : input.coreTaskInfo.task_elements
    );
    if (!notes) console.warn("[generatePlan] 조사 실패 — 예전 한 번 호출(검색 포함) 방식으로 진행");
  }
  const runStepA = (p: string) =>
    notes
      ? generate({ label: "generatePlan:write", role: "write", prompt: p, effort: writeEffort() })
      : generate({
          label: "generatePlan:stepA",
          role: "main",
          prompt: p,
          search: { force: wantSearch, maxCalls: 2 },
        });

  let stepA;
  try {
    stepA = await runStepA(buildStepAPrompt(input, notes));
  } catch (err) {
    console.error("[generatePlan] 1차 생성 재시도 후에도 실패", err);
    return {
      type: "insufficient_data",
      reason: "지금 검색 서비스가 불안정해서 콘텐츠를 만들지 못했어요. 잠시 후 다시 시도해주세요.",
    };
  }

  let freeText = stepA.text;
  if (!freeText) {
    return { type: "insufficient_data", reason: "AI가 빈 응답을 반환했습니다." };
  }

  // 인물 혼입 안전장치: fixedSubject가 있는데도 1차 결과에 그 이름이 한 번도
  // 등장하지 않으면, essay 쪽에서 확정한 대상을 무시하고 다른 대상으로 글을
  // 썼을 가능성이 높다(실제 사고 사례: 마틴 루터 킹 주니어를 선정했는데
  // 신문 제작 결과는 전태일 내용으로 만들어짐). 1회 강하게 재지시해서 재시도한다.
  // 원고가 확정한 대상은 "대한민국 임시정부의 환국(귀국)(1945년)"처럼 설명이 붙은 경우가 많아 글자 그대로는 거의 안 맞는다 —
  // 괄호를 빼고 띄어쓰기·문장부호를 무시해 비교한다(실측: 신문 과제 4회 모두 불필요한 계획 재작성). PLAN_SUBJECT_MATCH=exact면 예전처럼.
  const subjectCore = input.fixedSubject ? input.fixedSubject.replace(/\([^)]*\)/g, "").trim() || input.fixedSubject : "";
  const subjectHead = subjectCore.split(/\s+/)[0] ?? "";
  const mentionsSubject = (text: string) => {
    if (process.env.PLAN_SUBJECT_MATCH === "exact") return text.includes(input.fixedSubject ?? "");
    const body = compactName(text);
    // "김규식(…) 인터뷰…"처럼 뒤에 설명이 붙은 대상은 맨 앞 이름만 나와도 같은 대상으로 본다.
    return body.includes(compactName(subjectCore)) || (compactName(subjectHead).length >= 2 && body.includes(compactName(subjectHead)));
  };
  // 원고의 사실 노트를 그대로 받아 쓴 계획은 대상이 원고와 같을 수밖에 없다 — 이름 표기가 달라도(약칭 등) 다시 쓰지 않는다.
  // 실측(2026-10-24): "조선노동조합총동맹(…)"이 계획 글에 그대로 안 나와 계획 2개를 모두 다시 썼다.
  if (input.fixedSubject && !reusedEssayFacts && !mentionsSubject(freeText)) {
    console.warn(
      `[generatePlan] fixedSubject="${input.fixedSubject}"가 1차 결과에 등장하지 않음 — 강하게 재지시하여 1회 재시도`
    );
    try {
      const forcedPrompt =
        buildStepAPrompt(input, notes) +
        `\n\n【다시 한번 강조 — 반드시 지킬 것】 방금 쓴 글에 "${input.fixedSubject}"가 전혀 언급되지 않았다. ` +
        `이 과제의 대상은 오직 "${input.fixedSubject}" 하나뿐이다. 처음부터 끝까지 이 대상만 다뤄서 다시 쓸 것.`;
      const retryStepA = await runStepA(forcedPrompt);
      if (retryStepA.text && mentionsSubject(retryStepA.text)) {
        stepA = retryStepA;
        freeText = retryStepA.text;
      } else {
        console.warn("[generatePlan] 재지시에도 fixedSubject가 등장하지 않음 — 원래 응답으로 그대로 진행");
      }
    } catch (err) {
      console.error("[generatePlan] fixedSubject 재시도 실패(원래 응답으로 진행)", err);
    }
  }

  // 항목·사실 일관성 검사(기계적): (1) 안내문의 필수 항목이 "### 소제목"으로 다 있는지,
  // (2) 자료 수집에서 확정된 조사 자료에 없는 연도가 이 글에 새로 생기지 않았는지.
  // 자료 수집과 신문 제작이 사실을 독립적으로 다시 만들면서 어긋나던 문제(사망 연도
  // 1931 vs 1932 등)를 fixedSubject/referenceFactsText 프롬프트만으로는 100% 못
  // 막는다는 게 확인돼서, 여기서 결정론적으로 확인하고 1회 재지시한다.
  const requiredItems = planRequiredItems(input);
  const researchText = input.referenceFactsText;
  const inspectPlan = (text: string) => {
    const { content: c } = splitContentAndPhysicalText(text);
    return {
      missing: requiredItems ? findMissingItems(c, requiredItems) : [],
      badYears: researchText ? yearsMissingFromResearch(c, researchText) : [],
    };
  };
  let planIssues = inspectPlan(freeText);
  // 항목만 빠졌으면(연도 문제 없음) 글 전체를 다시 쓰지 않고 빠진 항목만 써서 끼워 넣는다 — 실측(2026-10-24) 39회 중 13회 계획 글쓰기가
  // 산출물 수보다 많았다. 사실 번호([F1])로 출처를 붙이는 조사→글쓰기 경로에서만(검색 직접 인용 경로는 각주 위치가 글자 위치라 끼워 넣으면 어긋난다).
  // PLAN_ITEM_FILL=rewrite면 예전처럼 전체를 다시 쓴다.
  if (notes && planIssues.missing.length > 0 && planIssues.badYears.length === 0 && process.env.PLAN_ITEM_FILL !== "rewrite") {
    const missing = planIssues.missing;
    console.warn(`[generatePlan] 필수 항목 누락 → 빠진 항목만 채움: ${JSON.stringify(missing)}`);
    try {
      const fill = await generate({
        label: "generatePlan:fillItems",
        role: "write",
        effort: writeEffort(),
        prompt: `아래는 학생이 제출할 "${input.elementLabel ?? input.coreTaskInfo.topic}" 산출물의 초안이다. 안내문이 요구한 다음 항목이 빠졌다: ${missing.join(", ")}.
빠진 항목마다 "### 항목명" 소제목 한 줄과 그 아래 본문 2~4문장만 써라. 다른 설명·머리말·이미 있는 내용은 쓰지 말 것.
- 초안에 이미 있는 사실과 [F번호]만 쓰고, 새 사실·연도·수치·인물을 만들지 말 것. 초안과 같은 대상·같은 말투로.
- "A 또는 B" 항목은 초안의 산출물에 맞는 쪽 하나만 쓴다(예: 만평이면 주제, 광고면 상품).${currentOutputLang() === "en" ? "\n- 소제목 줄은 항목명 그대로 두고 본문은 영어로 쓴다." : ""}
${ANTI_AI_TONE_RULES}

[초안]
${freeText}`,
      });
      const added = fill.text.trim();
      if (added) {
        const at = freeText.indexOf(PHYSICAL_HEADING);
        const lineStart = at >= 0 ? freeText.lastIndexOf("\n", at) + 1 : freeText.length;
        const merged = `${freeText.slice(0, lineStart).trimEnd()}\n\n${added}\n\n${freeText.slice(lineStart)}`.trimEnd();
        const after = inspectPlan(merged);
        if (after.missing.length < missing.length) {
          freeText = merged;
          stepA = { ...stepA, text: merged };
          planIssues = after;
        } else {
          console.warn("[generatePlan] 빠진 항목 채우기가 도움이 되지 않아 원래 초안 유지");
        }
      }
    } catch (err) {
      console.error("[generatePlan] 빠진 항목 채우기 실패(원래 초안 유지)", err);
    }
  } else if (planIssues.missing.length > 0 || planIssues.badYears.length > 0) {
    console.warn(
      `[generatePlan] 항목/사실 일관성 문제 감지, 1회 재시도: 누락항목=${JSON.stringify(planIssues.missing)} ` +
        `조사자료에없는연도=${JSON.stringify(planIssues.badYears)}`
    );
    try {
      const parts: string[] = [];
      if (planIssues.missing.length > 0) {
        parts.push(
          `[필수 항목 누락 정정 지시 — 반드시 지킬 것] 방금 쓴 글에는 안내문이 요구한 다음 항목이 "### " ` +
            `소제목으로 없거나 내용이 비어 있다: ${planIssues.missing.join(", ")}. 이번에는 누락된 항목마다 ` +
            `항목명의 핵심 단어가 들어간 "### " 소제목과 실제 내용을 추가할 것.`
        );
      }
      if (planIssues.badYears.length > 0) {
        parts.push(
          `[사실 일관성 정정 지시 — 반드시 지킬 것] 방금 쓴 글에는 이미 확정된 자료에 없는 연도가 새로 ` +
            `등장했다: ${planIssues.badYears.map((y) => `${y}년`).join(", ")}. 이번에는 이 연도들을 확정된 ` +
            `자료의 연도로 바로잡거나, 자료에 근거가 없다면 빼고 쓸 것(꼭 필요하면 검색으로 확인하고 [n] ` +
            `각주를 붙이되 확정된 자료와 충돌하면 안 된다).`
        );
      }
      const retryPrompt =
        buildStepAPrompt(input, notes) +
        `\n\n${parts.join("\n\n")}\n\n아래는 방금 쓴 초안이다. 위에서 지적한 부분만 고치고, 지적하지 않은 ` +
        `사실·표현·구조는 그대로 유지해서 두 제목("${CONTENT_HEADING}", "${PHYSICAL_HEADING}")을 갖춘 ` +
        `전체 글을 다시 써줘.\n\n[방금 쓴 초안]\n${freeText}`;
      const retryStepA = await runStepA(retryPrompt);
      if (retryStepA.text) {
        const retryIssues = inspectPlan(retryStepA.text);
        const originalChunks = stepA.grounding?.chunks?.length ?? 0;
        const retryChunks = retryStepA.grounding?.chunks?.length ?? 0;
        const regressedGrounding = originalChunks > 0 && retryChunks === 0;
        const better =
          retryIssues.missing.length + retryIssues.badYears.length <=
          planIssues.missing.length + planIssues.badYears.length;
        if (better && !regressedGrounding) {
          stepA = retryStepA;
          freeText = retryStepA.text;
          planIssues = retryIssues;
        } else {
          console.warn("[generatePlan] 재시도가 더 나아지지 않아 원래 응답으로 진행");
        }
      }
    } catch (err) {
      console.error("[generatePlan] 항목/사실 일관성 재시도 실패(원래 응답으로 진행)", err);
    }
  }

  const grounding = stepA.grounding;
  console.log(
    `[generatePlan] 그라운딩 진단: queries=${JSON.stringify(grounding?.queries ?? [])} ` +
      `groundingChunks=${grounding?.chunks?.length ?? 0}`
  );

  let annotated: string;
  let validatedSources: SourceRef[];
  if (notes) {
    // 글쓰기가 사실 번호를 거의 안 붙였으면 연도·수치가 같은 사실의 번호를 코드가 붙인다(완성 원고 경로와 같은 복구).
    let written = freeText;
    if ((written.match(/\[F\d+\]/g) ?? []).length < 2) written = attachFactMarkers(written, notes.facts).text;
    const mapped = mapFactMarkers(written, notes.facts);
    annotated = mapped.text;
    validatedSources = await validateSources(mapped.sources.map((s) => ({ ...s, url_valid: null })));
    console.log(`[generatePlan] 조사→글쓰기: 사실=${notes.facts.length}개 사용한 출처=${mapped.sources.length}개 본문각주=${(mapped.text.match(/\[\d+\]/g) ?? []).length}`);
  } else {
    const { sources, chunkIndexToN } = buildSourceList(grounding?.chunks);
    annotated = insertCitationMarkers(freeText, grounding?.supports, chunkIndexToN);
    validatedSources = await validateSources(sources);
  }

  // generate-essay.ts와 같은 이유(2026-09-16 라에네크 감사) — 검증 실패로
  // 확인된 출처를 가리키는 각주만 콕 집어 지운다. essay와 달리 plan은 이
  // 시점 이후에도(아래 5단계) validatedSources에 새 출처가 추가될 수 있어서,
  // 이 시점의 무효 출처만 우선 제거한다.
  // 링크 검증 실패뿐 아니라 "블로그·개인" 등급(source-quality.ts) 출처도 핵심 사실의 근거로 쓰지
  // 않는다 — 열리는 것과 근거로 쓸 만한 것은 다르다(각주 표시만 제거, 문장은 보존).
  const invalidNs = new Set(
    validatedSources.filter((s) => s.url_valid === false || s.tier === "weak").map((s) => s.n)
  );
  if (invalidNs.size > 0) {
    console.warn(`[generatePlan] 검증 실패한 출처를 가리키는 각주 제거: [${[...invalidNs].join(",")}]`);
    annotated = stripInvalidCitationMarkers(annotated, invalidNs);
  }

  const { content: rawContent, physicalText } = splitContentAndPhysicalText(annotated);
  let content = rawContent;
  const productionSteps = parseProductionSteps(physicalText);

  // 5단계(추천 다양성): 검증 성공한 통계/사례를 최대 1건(라우트 60초 제한
  // 고려, essay 경로와 동일한 이유) 골라 검색으로 재확인하고, 성공하면 그
  // 자리에 새 각주를 직접 끼워 넣는다. 기존(개편 전) 코드는 이 검증을
  // PlanStep 단위로 했지만, 이제 content가 essay처럼 하나의 이어진 글이라
  // essay 경로처럼 본문 문자열에 직접 [n]을 삽입하는 방식으로 바꿨다.
  const verifiedItemNames: string[] = [];
  const sourceById = new Map(validatedSources.map((s) => [s.n, s]));
  const userNumbers = collectUserNumbers(
    input.instructions,
    input.coreTaskInfo.topic,
    ...input.coreTaskInfo.requirements,
    ...input.coreTaskInfo.task_elements.flatMap((e) => [e.label, e.description, ...(e.required_items ?? [])])
  );
  // 조사 노트 경로의 수치는 노트(검색이 연 페이지)에서 온 것이라 다시 검색해 검증하지 않는다(검증 검색 1회당 약 12초·$0.02).
  const claim = notes ? null : findUnverifiedStatClaim(content, sourceById, { userNumbers, strictExternalOnly: !wantSearch });
  if (claim) {
    const result = await verifyExcerpt({ name: claim.sentence }, STATISTIC_OR_NEWS_QUERY_TEMPLATES);
    if (result.verified && result.source) {
      const n = validatedSources.reduce((max, s) => Math.max(max, s.n), 0) + 1;
      const newSource: SourceRef = { n, title: result.source.title, url: result.source.url, url_valid: null };
      validatedSources = [...validatedSources, newSource];
      content = `${content.slice(0, claim.afterEnd)}[${n}]${content.slice(claim.afterEnd)}`;
      verifiedItemNames.push(claim.sentence);
      console.log(`[generatePlan] 미검증 통계 주장 검증 성공: "${claim.sentence.slice(0, 40)}..." -> [${n}]`);
    } else {
      console.warn(`[generatePlan] 미검증 통계 주장 검증 실패(그대로 진행): "${claim.sentence.slice(0, 40)}..."`);
    }
  }

  // 최종 안전장치: 인용은 있는데 그 출처가 전부 위키/동영상처럼 원문 대조가
  // 불가능한 약한 출처뿐이면, 검증된 것처럼 보이는 각주를 남겨두지 않고
  // 각주 표기 자체를 지운다(약한 근거를 정식 출처인 것처럼 보여주지 않기
  // 위함 — generate-essay.ts의 stripWeaklySourcedQuotes와 같은 철학).
  if (validatedSources.length > 0 && validatedSources.every((s) => isWeakQuoteSource(s.url))) {
    console.warn("[generatePlan] 최종 안전장치: 출처가 전부 약한 매체(위키/동영상)뿐이라 각주를 제거함");
    content = content.replace(/\[\d+\]/g, "");
    validatedSources = [];
  }

  // generate-essay.ts와 같은 최종 안전망을 재사용한다 — plan 경로는 essay와
  // 달리 품질 재시도 루프가 없으므로(latency 고려), 프롬프트(FACTUAL_RIGOR_
  // RULES/ANTI_AI_TONE_RULES)로 애초에 덜 나오게 한 뒤, 그래도 남으면 이
  // 결정론적 strip으로 확정 처리한다.
  content = cleanMarkers(content, new Set(validatedSources.map((x) => x.n)));
  const { content: clicheCleanedContent } = stripClichesFromText(content);
  content = clicheCleanedContent;
  const { content: superlativeCleanedContent } = stripUnsupportedSuperlatives(content);
  content = superlativeCleanedContent;
  if (validatedSources.length === 0) {
    const { content: refListCleanedContent, stripped } = stripFakeReferenceList(content);
    if (stripped) {
      console.warn("[generatePlan] 최종 안전장치: 미검증 자기 생성 참고문헌 목록 제거함");
      content = refListCleanedContent;
    }
  }

  // 모델이 스스로 붙인 참고 목록·작업 설명 줄을 걷어내고, 출처를 필요한 만큼(보통 3개)으로 정리한다(essay 경로와 같은 이유 — essay/source-select.ts).
  content = stripMetaNoteLines(stripModelReferenceBlock(content).content).content;
  // 본문 속 "(사이트 (https://…))" 주소와 "(…를 확인했다)" 같은 작업 메모는 학생이 옮겨 쓸 글이 아니다(실측: 사설 한 편에 주소 9개). 출처는 목록이 따로 보여 준다.
  if (qualityFixesOn()) {
    const notes = stripWorkNotes(content);
    const urls = stripInlineUrls(notes.content);
    const reported = reduceReportedSpeech(urls.content);
    const josa = fixJosaAfterTitle(reported.content);
    const ordinals = stripOrdinalEnumerators(josa.content);
    if (notes.removed + urls.removed + reported.changed + josa.changed > 0)
      console.warn(`[generatePlan] 작업 메모 ${notes.removed}개·본문 주소 ${urls.removed}개 제거, 전달형 꼬리 ${reported.changed}개·제목 조사 ${josa.changed}개 정리`);
    content = ordinals.content;
    if (ordinals.changed > 0) console.warn(`[generatePlan] 서수 나열 표지(첫째·둘째) ${ordinals.changed}개 정리`);
  }
  // 국내 출처 범위: 해외 출처와 그 각주 번호를 뺀다(조사 단계에서 이미 걸렀어도 검색 한 번에 쓰기·통계 재확인 경로로 들어올 수 있다).
  if (currentSourceScope() === "domestic") {
    const foreignNs = new Set(validatedSources.filter((s) => !isDomesticUrl(s.url)).map((s) => s.n));
    if (foreignNs.size > 0) {
      console.warn(`[generatePlan] 국내 출처 범위: 해외 출처 ${foreignNs.size}개 제거`);
      content = stripInvalidCitationMarkers(content, foreignNs);
      validatedSources = validatedSources.filter((s) => !foreignNs.has(s.n));
    }
  }
  if (validatedSources.length > 0) {
    const wanted = requiredSourceCount([...input.coreTaskInfo.requirements, ...input.coreTaskInfo.task_elements.map((e) => e.description)]);
    // 완성 원고 쪽과 같은 기준(기본 5, SOURCE_LIMIT으로 되돌림) — 한도 3은 확보한 출처와 각주를 과하게 잘라냈다.
    const lim = limitSources([content], validatedSources, Math.min(8, Math.max(2, wanted ?? (Number(process.env.SOURCE_LIMIT) || 5))));
    content = lim.contents[0];
    validatedSources = lim.sources;
  }

  // 시험지·안내문의 문장·문단 수 조건(장면 수는 필수 항목 검사가 맡는다): 어긴 경우 검색 없이 한 번만 고치고, 못 맞추면 경고로 알린다.
  let formWarning: string | undefined;
  const formEl = targetElement(input);
  if (formEl && formRequirementsOn()) {
    const reqs = requirementsForElement(formEl, input.coreTaskInfo.requirements, input.coreTaskInfo.writing_guide, input.coreTaskInfo.task_elements.map((e) => e.label));
    const skipScene = isSceneListElement(formEl);
    const issues = checkFormRequirements(content, reqs, { skipScene });
    if (issues.length > 0) {
      console.warn(`[generatePlan] 형식 조건 위반: ${JSON.stringify(issues.map((i) => ({ unit: i.req.word, min: i.req.min, max: i.req.max, actual: i.actual })))}`);
      const r = await repairFormRequirements({ label: formEl.label, content, description: formEl.description, reqs, issues, skipScene });
      console.log(`[generatePlan] 형식 조건 보완 적용=${r.repaired} 남은 위반=${r.remaining.length}건`);
      if (r.repaired) content = r.content;
      if (r.remaining.length > 0) formWarning = formWarningText(r.remaining);
    }
  }

  content = tidyOutputText(content);

  console.log(`[generatePlan] latency_ms=${Date.now() - start}`);

  return {
    type: "plan",
    content,
    productionSteps,
    sources: validatedSources,
    latency_ms: Date.now() - start,
    verifiedItemNames,
    // 출처 0개만으로 경고하지 않고, 검증이 필요한 사실 주장이 실제로 있을 때만(스토리보드 같은 장면 단계는 수치·연도·책 제목이 있을 때만).
    noSourcesWarning: validatedSources.length === 0 && hasVerifiableClaimText(content, { sceneList: !!formEl && formRequirementsOn() && isSceneLikeElement(formEl) }),
    structureWarning:
      [planIssues.missing.length > 0 ? `안내문이 요구한 항목이 비어 있어요: ${planIssues.missing.join(", ")}. 제출 전에 직접 보완해주세요.` : "", formWarning ?? ""].filter(Boolean).join(" ") || undefined,
    factConsistencyWarning:
      planIssues.badYears.length > 0
        ? `자료 수집에서 확정한 내용에 없는 연도가 있어요: ${planIssues.badYears.map((y) => `${y}년`).join(", ")}. 자료 수집 내용과 맞는지 확인해주세요.`
        : undefined,
  };
}
