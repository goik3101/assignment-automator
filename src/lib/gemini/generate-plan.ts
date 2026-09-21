import { generate } from "@/lib/llm";
import {
  ANTI_AI_TONE_RULES,
  NO_META_COMMENTARY_RULE,
  PERSPECTIVE_RULE,
  MULTI_DELIVERABLE_SEPARATION_RULE,
  FACTUAL_RIGOR_RULES,
  ACHIEVEMENT_INTERPRETATION_RULES,
} from "./prompts";
import { buildSourceList, insertCitationMarkers, stripInvalidCitationMarkers, tidyOutputText } from "./citations";
import {
  extractYears,
  findMissingItems,
  parseResearchItems,
  yearsMissingFromResearch,
} from "@/lib/research/research-items";
import { validateSources } from "@/lib/links/validate-sources";
import { verifyExcerpt, isWeakQuoteSource, STATISTIC_OR_NEWS_QUERY_TEMPLATES } from "@/lib/verification/excerpt-verification";
import { stripClichesFromText, stripUnsupportedSuperlatives, stripFakeReferenceList } from "./generate-essay";
import type { CoreTaskInfo, PlanResult, ProductionStep, SourceRef, InsufficientDataResult } from "@/types/task";

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
}

const CONTENT_HEADING = "## 완성된 글";
const PHYSICAL_HEADING = "## 직접 만들어야 할 것";

/** 이 산출물(external_production)이 안내문에서 요구받은 필수 항목 — 조사·탐구형
 * ("sections")일 때만 "### 항목" 구조와 누락 검사를 적용한다. */
function planRequiredItems(input: GeneratePlanInput): string[] | undefined {
  const element = input.coreTaskInfo.task_elements.find((e) => e.type === "external_production");
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

function buildStepAPrompt(input: GeneratePlanInput): string {
  const element = input.coreTaskInfo.task_elements.find(
    (e) => e.type === "external_production"
  );
  const requiredItems = planRequiredItems(input);
  const structuredFacts = input.referenceFactsText ? formatResearchFacts(input.referenceFactsText) : null;
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
${input.coreTaskInfo.requirements.map((r) => `- ${r}`).join("\n") || "(명시된 요구사항 없음)"}
[이 요소에 대한 설명] ${element?.description ?? ""}
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
${input.instructions ? `[학생이 추가로 입력한 지침]\n${input.instructions}` : ""}
${input.avoidanceInstruction ? `[다양성 확보를 위한 회피 지시 — 반드시 반영할 것]\n${input.avoidanceInstruction}` : ""}
${input.recentStatGuidance ? `\n${input.recentStatGuidance}\n` : ""}
${input.personalization ? `[학생 개인화 정보 — 자연스럽게 녹여낼 것]\n${input.personalization}` : ""}
${input.revisionInstructions ? `[재생성 요청 — 학생이 이전 결과물에 만족하지 못해 다시 요청함. 아래 방향을 반드시 반영해 새로 작성할 것]\n${input.revisionInstructions}` : ""}

필요한 사실(통계, 사례, 원문 정보 등)은 반드시 실시간 검색으로 확인하고,
확인이 안 되면 지어내지 말 것.

【통계·사례·원문 검색은 한 번의 포괄적 검색으로 뭉뚱그리지 말 것 — 매우 중요】
구체적인 통계 수치나 사례를 인용할 계획이라면, "키워드 + 통계/사례" 정도로
한 번만 검색하고 멈추지 말고 서로 다른 각도로 여러 번 시도할 것 — 예를 들어:
${STATISTIC_OR_NEWS_QUERY_TEMPLATES.map((q, i) => `  ${i + 1}. ${q({ name: "<검색 키워드>", attribution: "<기관명>" })}`).join("\n")}
위키형 페이지(나무위키, 위키백과 등)나 동영상 자막만으로 확인하고 끝내지 말고,
가능하면 보도자료 원문·공공기관 발표자료·논문처럼 원자료 자체를 보여주는
페이지를 우선 찾을 것.

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
${FACTUAL_RIGOR_RULES}
${ACHIEVEMENT_INTERPRETATION_RULES}
${NO_META_COMMENTARY_RULE}
${PERSPECTIVE_RULE}
${MULTI_DELIVERABLE_SEPARATION_RULE}
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

// 완성된 글에 등장하는 통계/수치 주장에 각주가 없으면 검증 없이 지어낸
// 것으로 의심한다 — generate-essay.ts의 detectUnverifiedQuotes와 같은
// 발상이지만, 여기서는 책의 직접 인용이 아니라 통계·수치 주장을 본다.
const STAT_CLAIM_PATTERN = /\d[\d,]*(?:\.\d+)?\s?(?:%|퍼센트|명|건|원|배|위|개)/g;

function findUnverifiedStatClaim(
  content: string,
  sourceById: Map<number, SourceRef>
): { afterEnd: number; sentence: string } | null {
  STAT_CLAIM_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = STAT_CLAIM_PATTERN.exec(content))) {
    const afterEnd = m.index + m[0].length;
    const trailingWindow = content.slice(afterEnd, afterEnd + 60);
    const citedNs = Array.from(trailingWindow.matchAll(/\[(\d+)\]/g), (mm) => Number(mm[1]));
    const hasTrustworthyCitation = citedNs.some((n) => {
      const src = sourceById.get(n);
      return src && !isWeakQuoteSource(src.url);
    });
    if (!hasTrustworthyCitation) {
      const sentenceStart = content.lastIndexOf(".", m.index) + 1;
      const rest = content.slice(afterEnd);
      const endRel = rest.search(/[.!?\n]/);
      const sentenceEnd = endRel === -1 ? content.length : afterEnd + endRel + 1;
      return { afterEnd, sentence: content.slice(sentenceStart, sentenceEnd).trim() };
    }
  }
  return null;
}

export async function generatePlan(
  input: GeneratePlanInput
): Promise<PlanResult | InsufficientDataResult> {
  const start = Date.now();

  const runStepA = (p: string) =>
    generate({
      label: "generatePlan:stepA",
      role: "main",
      prompt: p,
      search: {},
    });

  let stepA;
  try {
    stepA = await runStepA(buildStepAPrompt(input));
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
  if (input.fixedSubject && !freeText.includes(input.fixedSubject)) {
    console.warn(
      `[generatePlan] fixedSubject="${input.fixedSubject}"가 1차 결과에 등장하지 않음 — 강하게 재지시하여 1회 재시도`
    );
    try {
      const forcedPrompt =
        buildStepAPrompt(input) +
        `\n\n【다시 한번 강조 — 반드시 지킬 것】 방금 쓴 글에 "${input.fixedSubject}"가 전혀 언급되지 않았다. ` +
        `이 과제의 대상은 오직 "${input.fixedSubject}" 하나뿐이다. 처음부터 끝까지 이 대상만 다뤄서 다시 쓸 것.`;
      const retryStepA = await runStepA(forcedPrompt);
      if (retryStepA.text?.includes(input.fixedSubject)) {
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
  if (planIssues.missing.length > 0 || planIssues.badYears.length > 0) {
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
        buildStepAPrompt(input) +
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

  const { sources, chunkIndexToN } = buildSourceList(grounding?.chunks);
  let annotated = insertCitationMarkers(freeText, grounding?.supports, chunkIndexToN);
  let validatedSources = await validateSources(sources);

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
  const claim = findUnverifiedStatClaim(content, sourceById);
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

  content = tidyOutputText(content);

  console.log(`[generatePlan] latency_ms=${Date.now() - start}`);

  return {
    type: "plan",
    content,
    productionSteps,
    sources: validatedSources,
    latency_ms: Date.now() - start,
    verifiedItemNames,
    structureWarning:
      planIssues.missing.length > 0
        ? `안내문이 요구한 항목이 비어 있어요: ${planIssues.missing.join(", ")}. 제출 전에 직접 보완해주세요.`
        : undefined,
    factConsistencyWarning:
      planIssues.badYears.length > 0
        ? `자료 수집에서 확정한 내용에 없는 연도가 있어요: ${planIssues.badYears.map((y) => `${y}년`).join(", ")}. 자료 수집 내용과 맞는지 확인해주세요.`
        : undefined,
  };
}
