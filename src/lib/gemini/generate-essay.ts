import { dedupeAdjacentMarkers, cleanMarkers } from "./citation-cleanup";
import { generate } from "@/lib/llm";
import { currentSourceScope } from "@/lib/llm/scope";
import { isDomesticUrl, keepInScope } from "@/lib/essay/source-scope";
import { needsFactSearch } from "@/lib/llm/search-policy";
import { BOOK_TASK_HINT_PATTERN } from "./book-hint";
import { Type, type Schema } from "@google/genai";
import {
  ANTI_AI_TONE_RULES,
  COPYRIGHT_RULES,
  NO_META_COMMENTARY_RULE,
  CITATION_JUDGMENT_RULE,
  PERSPECTIVE_RULE,
  MULTI_DELIVERABLE_SEPARATION_RULE,
  REAL_PERSON_NAME_RULE,
  FACTUAL_RIGOR_RULES,
  ACHIEVEMENT_INTERPRETATION_RULES,
  RESEARCH_MATERIAL_RULES,
  REPORT_SECTION_RULES,
  FORM_FIDELITY_RULES,
  writingGuideBlock,
  OWN_RECORD_RULES,
  NO_REFERENCE_LIST_RULE,
  NO_STEP_REPETITION_RULE,
  sourceEconomyRule,
} from "./prompts";
import { findMissingItems, parseResearchItems } from "@/lib/research/research-items";
import { buildSourceList, insertCitationMarkers, stripInvalidCitationMarkers, tidyOutputText } from "./citations";
import { validateSources, getCachedPageText } from "@/lib/links/validate-sources";
import {
  buildNewspaperBlock,
  buildSourceListSection,
  stripTrailingItemHeading,
  inferDeliverableForm,
  isFinalReportForm,
  isProseForm,
  isResearchMaterialStep,
  isSourceListItem,
  splitProductionNotes,
  stripInlineUrls,
  stripWorkNotes,
  reduceReportedSpeech,
  fixJosaAfterTitle,
  stripOrdinalEnumerators,
  stripMetaNoteLines,
  stripHeadingDirectives,
  stripModelReferenceBlock,
  tabTableToMarkdown,
  stripWorkMarkers,
} from "@/lib/essay/deliverable";
import { evidenceSlotsOn, formRequirementsOn, planCitationsOn, qualityFixesOn, stepOrderOn, unverifiedMarkOn, writerGeneralKnowledgeOn } from "@/lib/essay/quality-flags";
import { stripPlanCitations } from "@/lib/essay/plan-citations";
import { blankOveruseRepairText, countBlanks, findOwnActivitySentences, isOwnRecordStep, ownActivityRepairText } from "@/lib/essay/own-activity";
import { findUncitedFigures, uncitedFigureRepairText } from "@/lib/essay/uncited-figures";
import {
  bannedVisualRepairText,
  dataTableInstruction,
  dataTableRepairText,
  findBannedVisuals,
  hasDataTable,
  needsDataTable,
  visualPolicy,
  visualPolicyInstruction,
} from "@/lib/essay/data-visual";
import {
  NO_EVIDENCE_PLAN,
  evidenceResearchBlock,
  evidenceTopUpBlock,
  distinctHostCount,
  needsMoreEvidence,
  planEvidence,
  type EvidencePlan,
} from "@/lib/essay/evidence-slots";
import {
  applyFormRequirements,
  buildFormLimitBlock,
  buildSceneBlock,
  checkFormRequirements,
  isSceneLikeElement,
  isSceneListElement,
  requirementsForElement,
  sceneBlockInputs,
} from "@/lib/essay/form-requirements";
import { formWarningText, repairFormRequirements } from "@/lib/essay/form-repair";
import { renderScopedGuide, renderScopedRequirements } from "@/lib/essay/requirement-scope";
import { BOOK_TITLE_PATTERN, FACTUAL_CLAIM_HINT_PATTERN, QUOTE_PATTERN, hasVerifiableClaimText } from "@/lib/essay/verifiable-claims";
import { stripOpinionCitations } from "@/lib/essay/opinion-citations";
import { GRAMMAR_REPAIR_TEXT, missingGrammarForms, requiredGrammarForms } from "@/lib/essay/english-grammar";
import { promptRuleScope } from "@/lib/essay/prompt-scope";
import { describePair, findRepeatedStatements } from "@/lib/essay/repetition";
import { checkClaims, describeToken, type ClaimFinding, type PageTexts } from "@/lib/essay/claim-check";
import { findUncoveredFlowingItems, type CoverageGap } from "@/lib/essay/coverage";
import { lengthGuideLines } from "@/lib/essay/length-plan";
import { buildFormRulesBlock } from "@/lib/essay/form-rules";
import { limitSources, requiredSourceCount, retainedAtLimit } from "@/lib/essay/source-select";
import { needsExcerpt } from "@/lib/essay/excerpt-need";
import { itemGroups, itemWriteInstruction, mergeItemParts, mergeParallelParts, ownSection, parallelWriteInstruction, parallelWriteOn, previousStepsBlock } from "@/lib/essay/parallel-write";
import { stepWaves } from "@/lib/essay/step-order";
import { acceptKoreanRewrite, flippedToEnglish, koreanGuardOn, koreanLanguageIssue, koreanRewritePrompt } from "@/lib/essay/korean-guard";
import { currentOutputLang, scaleLengthsForEnglish } from "@/lib/llm/output-lang";
import {
  attachFactMarkers,
  buildFacts,
  confirmBookFromPages,
  parseBookResearch,
  extractSummaryLines,
  factSheetText,
  mapFactMarkers,
  mergeFacts,
  normalizeUrl,
  parseFactJson,
  type Fact,
} from "@/lib/essay/research-notes";
import { researchCacheKey, worthCaching } from "@/lib/essay/research-cache-key";
import { getCachedResearch, putCachedResearch } from "@/lib/essay/research-cache";
import {
  verifyExcerpt,
  verifyAuthorAttribution,
  sameAttribution,
  isVideoPlatformUrl,
  isWeakQuoteSource,
  looksLikeMarketingCopy,
  BOOK_EXCERPT_QUERY_TEMPLATES,
  type VerificationResult,
} from "@/lib/verification/excerpt-verification";
import { loadSelectionHistory } from "@/lib/recommendations/recommendation-diversity";
import { bigramSimilarity, canonicalize, compactName, sameEntity } from "@/lib/selection/canonical";
import { rewriteUnquoted, findQuoteResidue, stripQuotesWhere } from "@/lib/gemini/quote-cleanup";
import { postprocessStyle, STYLE_POSTPROCESS_FLAGS } from "@/lib/gemini/style-postprocess";
import { selectFromCandidates, type HistoryEntry } from "@/lib/selection/score";
import { selectSubjectForTask, type SelectedSubject } from "@/lib/selection/subject-selection";
import type { ClaimCheckSummary, CoreTaskInfo, EssayResult, InsufficientDataResult, SourceRef } from "@/types/task";

// 기획서 5-1: 완성 원고 경로는 그라운딩 켠 상태로 마크다운을 바로 받는다.
//
// M1 구현 노트: Gemini의 groundingSupports는 "완성된 응답 전체"에 대해서만
// 정확한 바이트 오프셋을 주기 때문에, 토큰 단위 스트리밍 대신 한 번에 전체
// 응답을 받아 각주를 정확히 삽입하는 방식을 택했다.
//
// 여러 차시(단계)로 이어지는 과제(예: 고민쓰기→친구의 고민 분석→책처방전→편지)라도
// **한 번의 호출**로 모든 단계를 한꺼번에 생성한다 — 단계를 나눠서 여러 번 호출하면
// 각 호출이 이전 호출의 확정된 사실(이름, 책 제목 등)을 몰라서 매번 다르게
// 지어내는 문제가 있었다(PROGRESS.md 참고). 같은 컨텍스트 안에서 한 번에 쓰면
// 이 문제가 애초에 구조적으로 생기지 않는다.

export interface GenerateEssayInput {
  subject: string;
  coreTaskInfo: CoreTaskInfo;
  /** F1~F2에서 학생이 입력한 지침. 무작위로 뽑은 친구의 고민 원문처럼, AI가 알 수
   * 없는 특정 단계에 필요한 실제 정보가 여기 담겨 올 수 있다 — 반드시 프롬프트에
   * 그대로 반영해야 한다. */
  instructions?: string;
  /** M2에서 클러스터 겹침 방지 로직이 채워 넣을 회피 지시. */
  avoidanceInstruction?: string;
  /**
   * recommendation-diversity.ts가 채워 넣는, 최근 자주 추천된 책 목록 기반
   * 안내 텍스트. avoidanceInstruction(클러스터 결과물 전체의 의미적 쏠림 회피)
   * 과는 다른 축이다 — 이건 "똑같은 책 제목이 문자 그대로 반복되는지"만 본다.
   * 이름을 분리해서 절대 섞이지 않게 함(둘 다 "다양성"이라는 말을 쓰지만
   * 서로 다른 메커니즘).
   */
  recentBookGuidance?: string;
  /**
   * recommendation-diversity.ts가 채워 넣는, 최근 자주 선정된 인물/사건 등
   * confirmed_subject 목록 기반 안내 텍스트. recentBookGuidance와 같은
   * 메커니즘을 "subject" 카테고리로 재사용한 것 — 책이 아니라 "인권 선구자
   * 한 명을 골라라" 같은 인물/사건 자유 선정형 과제에서, 서로 다른 계정인데도
   * 같은 인물(예: 방정환)이 반복 선정되는 걸 막기 위해 2026-09-16 추가.
   */
  recentSubjectGuidance?: string;
  /**
   * 후보 생성 ↔ 검증 분리(3단계): 이 값이 있으면 본문 생성(stageA)이 책을
   * "쓰면서" 즉흥적으로 고르지 않고, 이미 다양성을 고려해 선택된 이 책을
   * 그대로 처방/언급하도록 고정한다. `generateEssay()`가 `selectBookCandidate()`
   * 로 미리 계산해서 채운다 — 호출자가 직접 채울 일은 없다.
   */
  presetBook?: { title: string; author?: string };
  /**
   * 자동 선정(src/lib/selection/)이 미리 골라 확정한 다룰 대상(인물·사건·탐구 대상 등). 있으면 본문 생성이 대상을 새로
   * 고르지 않고 이 대상을 그대로 쓴다 — generateEssay()가 selection 옵션으로 채운다. 학생이 지침에 직접 지정한
   * 대상이면 userSpecified가 true(추천 로직 미실행).
   */
  presetSubject?: { name: string; key: string; group?: string | null; userSpecified?: boolean; tier?: string; fallbackUsed?: boolean };
  /**
   * 자동 선정 옵션. 주면 generateEssay()가 본문 생성 전에 대상 선정 단계를 실행한다(선정 과제일 때만).
   * scopeKey = 같은 수행평가 식별자(cluster_id), history = 테스트용 fixture 이력(없으면 DB에서 읽음).
   */
  selection?: { userId?: string | null; scopeKey?: string | null; history?: HistoryEntry[]; rng?: () => number };
  /** 설정 탭 개인화 정보 (M4 이후 연동) */
  personalization?: string;
  /** F6 재생성 시 학생이 입력하는 "이번엔 이렇게 고쳐줘" 방향 (9-5) */
  revisionInstructions?: string;
  /**
   * F6 재생성 시 이전 버전의 실제 결과 텍스트(전체 단계가 이어붙은 markdown).
   * 이게 있으면 인물 이름·구체적 에피소드·처방한 책 같은 "이미 정해진 사실"을
   * 재생성마다 새로 지어내지 않고 그대로 이어가라고 프롬프트에서 강하게 지시한다.
   */
  previousOutputText?: string;
  /** 내부용: 이미 만든 조사 노트(품질 재시도가 재사용). undefined=아직 안 함, null=시도했지만 실패(기존 경로 사용). */
  researchNotes?: ResearchNotes | null;
  /** 내부용: 시스템이 확인된 출처로 채울 출처 목록 항목(필수 항목에서 떼어 둔 것). generateEssay()가 채운다. */
  sourceListItems?: { label: string; item: string }[];
}

interface RawSection {
  label: string;
  content: string;
  /** 이 단계가 책을 언급/추천했으면 구조화된 형태로도 뽑아둔다 — 책 제목을
   * 《》/『』 겹낫표로 감싸는지, 아예 부호 없이 "책 제목: X"처럼 쓰는지가
   * 매번 달라서 본문 텍스트를 정규식으로 다시 파싱하는 건 형식이 조금만
   * 달라져도 놓친다(실제로 겪은 문제). 이 필드는 stage B가 원문을 분리하는
   * 김에 같은 호출에서 구조화된 값으로 직접 뽑아주므로 형식에 안 흔들린다. */
  citedBook?: { title: string; author?: string; quote?: string };
  /** 이 단계에 TaskElement.target_length가 있었는데 재시도까지 거치고도
   * 범위를 못 맞췄을 때만 채워진다(정직한 실패 표시용). */
  lengthWarning?: string;
  /** 안내문의 필수 항목을 "### 항목명" 소제목 구조로 쓰도록 요구된 단계(TaskElement.
   * items_format === "sections")면 그 항목 목록 — 누락 검사·최종 경고의 기준. */
  requiredItems?: string[];
  /** 소제목 없이 하나의 글로 쓰는 단계(items_format === "flowing")가 다뤄야 하는 항목 — 누락 판정 기준(소제목 검사는 못 한다). */
  flowingItems?: string[];
  /** "### 제작 참고" 블록(제출 내용이 아닌, 학생이 직접 구해 넣을 사진·그림 안내). content에서는 떼어낸다. */
  productionNotes?: string;
  /** 인용 문장↔출처 페이지 대조 결과(claim-check.ts). */
  claimCheck?: ClaimCheckSummary;
}

/** 필수 항목을 소제목 구조로 써야 하는 단계인가. */
function isStructuredElement(el: CoreTaskInfo["task_elements"][number]): boolean {
  return el.items_format === "sections" && (el.required_items?.length ?? 0) >= 2;
}

/** 각 sections 단계 중 필수 항목이 소제목으로 없거나 비어 있는 곳을 모은다. */
// "저자", "책 제목", "출판사" 같은 서지 칸은 소제목이 아니라 문장 속("이지성의 『꿈꾸는 다락방』")에 있어도 채운 것이다 —
// 실측(2026-10-22, 책 처방전): "저자" 소제목이 없다는 이유로 전체 재생성(+16초) 후에도 경고가 남았다.
const BIBLIO_ITEM = /^\s*(?:책\s*)?(?:제목|저자|지은이|작가|출판사|서지\s*(?:정보)?)\s*$/;
function detectMissingRequiredItems(sections: RawSection[]): { label: string; missing: string[] }[] {
  const result: { label: string; missing: string[] }[] = [];
  for (const s of sections) {
    if (!s.requiredItems) continue;
    const hasBook = qualityFixesOn() && /[『《][^』》]{1,60}[』》]/.test(s.content);
    const missing = findMissingItems(s.content, s.requiredItems).filter((m) => !(hasBook && BIBLIO_ITEM.test(m)));
    if (missing.length > 0) result.push({ label: s.label, missing });
  }
  return result;
}

/** 본문(content)을 되풀이해서 쓰게 하면 출력 토큰이 글 전체만큼 늘어 느리고 비싸다 — 코드가 원문에서 직접 잘라낼 수 있을 때는 메타데이터만 뽑는다. */
function withoutContent(schema: Schema): Schema {
  const clone = JSON.parse(JSON.stringify(schema)) as Schema;
  const items = (clone.properties!.sections as Schema).items as Schema;
  delete items.properties!.content;
  items.required = ["label"];
  return clone;
}

export const SECTIONS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    summary_lines: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "글 맨 앞에 있던 불릿 3줄 요약을 그대로 배열 원소 3개로 옮겨줘(불릿 기호 자체는 빼고 텍스트만). " +
        "요약이 없었으면 빈 배열.",
    },
    confirmed_subject: {
      type: Type.STRING,
      description:
        "이 과제가 '인물/사건/자료 등을 자유롭게 선정'하는 유형이라 글쓴이가 특정 대상을 하나 골라서 " +
        "다뤘다면(예: 인권 선구자 한 명, 역사적 사건 하나, 추천 도서 한 권 등) 그 대상의 이름만 간단히 " +
        "적을 것(예: '마틴 루터 킹 주니어'). 안내문에 이미 대상이 정해져 있어 고를 필요가 없었다면 빈 문자열.",
    },
    sections: {
      type: Type.ARRAY,
      description:
        "요청받은 각 단계별로 분리한 본문. 순서는 요청받은 단계 순서와 동일하게 맞출 것.",
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING, description: "그 단계의 이름 (요청받은 이름 그대로, 토씨 하나 틀리지 말 것)" },
          content: {
            type: Type.STRING,
            description:
              "그 단계의 본문. '## 라벨' 제목 줄 자체는 빼고 본문만. 각주 표기([1], [2] 등)는 원문 그대로 유지. " +
              "(참고: 코드가 원문에서 직접 잘라내는 걸 우선 쓰고 이 필드는 그게 실패했을 때만 쓰는 예비용이니, " +
              "그래도 최대한 정확하게 그대로 옮겨줘.)",
          },
          cited_book_title: {
            type: Type.STRING,
            description:
              "이 단계가 책을 언급/추천했다면 그 책 제목만(겹낫표·따옴표 등 부호는 빼고 텍스트만). 책을 언급하지 않았으면 빈 문자열.",
          },
          cited_book_author: {
            type: Type.STRING,
            description: "그 책의 저자. 모르거나 책을 언급하지 않았으면 빈 문자열.",
          },
          cited_book_quote: {
            type: Type.STRING,
            description:
              "이 단계 본문에 그 책의 '인상 깊은 구절'로 따옴표를 써서 직접 인용한 문장이 있으면 그 문장(따옴표 제외) 그대로. 직접 인용 없이 패러프레이즈만 있거나 인용 자체가 없으면 빈 문자열.",
          },
        },
        required: ["label", "content"],
      },
    },
  },
  required: ["sections"],
};

// 모델이 스스로 지어낸 가짜 각주([2차시 원문] 등)나, 지침 원문을 따옴표 대신
// 대괄호로 감싸버린 경우([지훈: ... 서럽더라.])를 잡아낸다. 각주 표기 [1], [2]처럼
// 대괄호 안이 "순수 숫자"인 경우만 정상이므로 그 외에는 전부 의심스러운 것으로 본다.
// "[자료부족: ...]"만 예외 — 그건 별도 로직(insufficientMatch)이 처리한다.
const PLACEHOLDER_PATTERN = /\[(?!\d+\])[^\]]*\]/g;

// 위 패턴에 걸린 이상한 대괄호를 실패 처리하는 대신 최대한 자연스럽게 정리한다 —
// 실제로 돌려보니 모델이 이런 대괄호를 흔하게 쓰는데(빈도가 낮지 않음), 매번
// 통째로 생성 실패시키면 사용자가 "생성 실패"를 너무 자주 보게 된다. 짧은
// 라벨성 문구(예: "[2차시 원문]")는 통째로 지우고, 문장처럼 긴 내용(따옴표
// 대신 대괄호로 감싼 인용 등)은 대괄호만 벗겨내고 내용은 살린다.
function cleanStrayBrackets(content: string): string {
  return content
    .replace(PLACEHOLDER_PATTERN, (match) => {
      if (match.startsWith("[자료부족")) return match; // 별도 로직이 처리하므로 건드리지 않음
      if (match === "[이름]") return match; // 실존 인물 이름 빈칸(REAL_PERSON_NAME_RULE) — 의도된 표기이니 그대로 둠
      // 학생이 직접 채울 빈칸(제작 전 질문의 "나중에 쓸게요", 청중기록지 같은 기록지 규칙) — 지우면 빈칸이 사라진다.
      if (/^\[직접\s*작성/.test(match)) return match;
      const inner = match.slice(1, -1).trim();
      const looksLikeSentence = inner.length > 20 || /[.!?…]$/.test(inner);
      return looksLikeSentence ? inner : "";
    })
    .replace(/ {2,}/g, " ")
    .replace(/ *\n */g, "\n");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 실제로 발견된 심각한 버그: stage B(작은 모델, flashLite)에게 "## 라벨"로
 * 나뉜 본문을 각주 표기까지 그대로 옮겨 적으라고 시켰더니, 한글 음절이
 * 통째로 사라지는 사고가 있었다(예: "스스로를[1][2]"를 옮겨 적다가
 * "[1][2]스로를"로 — "스" 한 글자가 통째로 증발). 각주 삽입 자체
 * (insertCitationMarkers, UTF-8 바이트 단위 삽입)는 Buffer 연산이라 이런
 * 손실이 구조적으로 불가능하고, 실제로 원인은 그 뒤 단계 — 모델이 긴 텍스트를
 * "그대로 옮겨 적기"(verbatim 재현)를 토큰 단위로 재생성하다가 대괄호+숫자가
 * 한글에 바짝 붙은 낯선 토큰 경계에서 가끔 한 조각을 빠뜨리는 것으로 보인다
 * (LLM 출력은 문자 단위 복사가 아니라 토큰 단위 재생성이라 "그대로 옮겨라"는
 * 지시만으로는 100% 보장이 안 된다는 게 이 프로젝트에서 반복 확인된 패턴).
 *
 * 그래서 본문 자체는 더 이상 stage B의 출력에 의존하지 않는다 — 이미 각주까지
 * 정확히 삽입된 것으로 검증된 annotated 텍스트를, stage A가 반드시 넣기로
 * 약속한 "## <라벨>" 제목줄을 기준으로 코드가 직접(순수 문자열 slice로) 잘라낸다.
 * 정규식 매칭과 문자열 slice는 전부 JS 문자열(UTF-16 코드 유닛) 기준으로
 * 일관되게 동작하므로 글자 손실이 원천적으로 불가능하다. stage B는 이제
 * summary_lines/cited_book_* 같은 "해석이 필요한" 필드만 담당한다(이런 필드는
 * 어차피 verifyExcerpt/verifyAuthorAttribution으로 별도 검증하므로 약간의
 * 재현 오차가 있어도 안전망이 있다 — 원문 자체와는 위험도가 다르다).
 *
 * 혹시라도 stage A가 지시를 안 지켜서 "## <라벨>" 줄을 못 찾으면(드물게라도
 * 발생하면 조용히 빈 본문을 내보내는 대신) 호출부가 stage B의 content 필드로
 * 폴백할 수 있도록 못 찾은 라벨은 그냥 담지 않는다.
 */
function splitAnnotatedIntoSections(annotated: string, labels: string[]): Map<string, string> {
  const result = new Map<string, string>();
  const headings: { label: string; headingStart: number; contentStart: number }[] = [];
  let searchFrom = 0;
  // 띄어쓰기·기호만 다른 제목("## 사설/칼럼" vs 라벨 "사설 / 칼럼")도 같은 단계로 본다 — 실측(2026-10-22): 조사→글쓰기 경로는
  // 단계 분리 모델(stage B)을 부르지 않아 정확히 일치하지 않으면 그 단계가 빈 글(0자)로 경고 없이 나갔다.
  const squashLabel = (s: string) => s.replace(/[\s/·・,.\-–—()[\]{}<>「」『』"'*#:]/g, "").toLowerCase();
  for (const label of labels) {
    const re = new RegExp(`^##[ \\t]*${escapeRegExp(label)}[ \\t]*$`, "m");
    let m: { index: number; 0: string } | null = re.exec(annotated.slice(searchFrom));
    if (!m && qualityFixesOn()) {
      const rest = annotated.slice(searchFrom);
      for (const lm of rest.matchAll(/^##(?!#)[^\n]*$/gm)) {
        const text = lm[0].replace(/^##/, "");
        if (squashLabel(text) === squashLabel(label) || (squashLabel(label).length >= 2 && squashLabel(text).startsWith(squashLabel(label)))) {
          m = { index: lm.index ?? 0, 0: lm[0] };
          break;
        }
      }
    }
    if (!m) {
      console.warn(`[generateEssay] annotated 텍스트에서 "## ${label}" 제목줄을 찾지 못함 — 이 단계는 stage B의 content로 폴백`);
      continue;
    }
    const headingStart = searchFrom + m.index;
    const contentStart = headingStart + m[0].length;
    headings.push({ label, headingStart, contentStart });
    searchFrom = contentStart;
  }
  headings.forEach(({ label, contentStart }, i) => {
    const contentEnd = i + 1 < headings.length ? headings[i + 1].headingStart : annotated.length;
    result.set(label, annotated.slice(contentStart, contentEnd).trim());
  });
  return result;
}

// 10종 수행평가 교차 테스트(2026-09-13)에서 발견된 가장 심각한 문제: 과목이
// "영어"이고 라벨이 "영어 발표 대본"인 과제인데도 완성 원고 전체가 한국어로
// 나온 사례가 실제로 있었다 — 지금까지 이 파일의 모든 문체 규칙은 "어떻게
// 쓸지"만 다뤘지 "무슨 언어로 쓸지"는 아예 다룬 적이 없었다(항상 한국어라고
// 암묵적으로 가정). 과목/라벨/설명에 외국어 과목명이 있으면 그 언어로 쓰라고
// 명시한다.
const LANGUAGE_KEYWORDS: { keyword: string; language: string }[] = [
  { keyword: "영어", language: "English(영어)" },
  { keyword: "중국어", language: "Chinese(중국어)" },
  { keyword: "일본어", language: "Japanese(일본어)" },
];

// 영어 과목이어도 "한글로 작성"이라고 적힌 단계는 한국어다(실측 2026-10-22: 영어 수행평가의 "과정쓰기 — 한글로 작성"을 영어로 쓰게 하고, 한국어로 쓴 첫 글을 언어 오류로 보고 재작성까지 했다).
const KOREAN_ONLY = /한글로|한국어로|우리말로/;
function detectElementLanguage(subject: string, el: CoreTaskInfo["task_elements"][number]): string | null {
  // 화면 언어가 English면 모든 단계를 영어로 쓴다(학생이 고른 언어가 안내문 언어보다 우선 — output-lang.ts).
  if (currentOutputLang() === "en") return "English(영어)";
  if (qualityFixesOn() && KOREAN_ONLY.test(`${el.label} ${el.description}`)) return null;
  const haystack = `${subject} ${el.label} ${el.description}`;
  for (const { keyword, language } of LANGUAGE_KEYWORDS) {
    if (haystack.includes(keyword)) return language;
  }
  return null;
}

/** 지정된 언어로 써야 하는 단계인데 실제로는 한글 비중이 높으면(한국어로
 * 써버린 것으로 의심) 감지한다 — 공백을 뺀 전체 글자 수 대비 한글 음절
 * 비율이 20%를 넘으면 의심스럽다고 본다(외국어 글에서도 고유명사 등으로
 * 한글이 소량 섞일 수는 있어 0%가 아니라 여유를 둠). */
function detectLanguageMismatches(
  sections: RawSection[],
  elements: CoreTaskInfo["task_elements"],
  subject: string
): string[] {
  const mismatched: string[] = [];
  for (const el of elements) {
    const lang = detectElementLanguage(subject, el);
    if (!lang) continue;
    const section = sections.find((s) => s.label === el.label);
    if (!section || !section.content.trim()) continue;
    const hangulCount = (section.content.match(/[가-힣]/g) ?? []).length;
    const totalCount = section.content.replace(/\s/g, "").length;
    if (totalCount > 0 && hangulCount / totalCount > 0.2) {
      mismatched.push(`${el.label}(${lang}로 작성해야 함)`);
    }
  }
  return mismatched;
}

// 검색·책·인용구 규칙은 과제가 실제로 필요로 할 때만 프롬프트에 넣는다(모든 과제에 책 인용구 규칙 약 80줄이 들어가 검색을 늘리고 시간을 잡아먹었다).
const SEARCH_CALL_RULE_BOOK = `【검색 도구를 실제로 호출할 것 — 매우 중요】 책 제목·저자·줄거리·인용구·역사적
사실·통계처럼 검색으로 검증 가능한 구체적 사실이 필요한 단계가 하나라도 있다면,
그 사실을 쓰기 전에 반드시 실시간 웹 검색 도구를 실제로 최소 한 번 이상 호출해서
확인할 것. 이미 잘 알려진 유명한 책이나 상식이라고 생각되더라도 예외 없이
검색으로 재확인한 뒤 쓸 것 — "이미 아는 내용이니 검색은 생략해도 된다"고
판단하지 말 것. 검색 없이 책 제목/저자/인용구를 써서는 절대 안 된다. 후보가
여러 개 검색되면, 아래 【책 존재/서지정보 확인】 기준으로 신뢰도가 높은(서지정보를
텍스트로 명확히 갖춘) 페이지를 우선 각주로 채택하고, 위키형·커뮤니티형·동영상
플랫폼은 다른 후보가 없을 때만 보조적으로 쓸 것.`;

const SEARCH_CALL_RULE_GENERIC = `【검색 도구를 실제로 호출할 것 — 매우 중요】 역사적 사실·인물 정보·통계·연도처럼 검색으로
검증 가능한 구체적 사실이 필요한 단계가 하나라도 있다면, 그 사실을 쓰기 전에 반드시 실시간 웹 검색 도구를
실제로 호출해서 확인할 것. 이미 아는 내용이라도 검색으로 재확인한 뒤 쓸 것. 검색 없이 연도·수치·고유명을
써서는 안 된다. 신뢰도가 높은 페이지(공식 기관·원문·신뢰 매체)를 우선 각주로 채택하고, 위키형·커뮤니티형·
동영상 플랫폼은 다른 후보가 없을 때만 보조적으로 쓸 것.`;

function excerptSearchRule(): string {
  return `【인상 깊은 구절은 검색어를 한 번만 던지고 포기하지 말 것 — 매우 중요】 책 제목·
저자만 검색해서는 원문이 노출된 페이지가 잘 안 잡힌다. "책 제목 + 저자" 검색
하나로 안 나오면 거기서 멈추지 말고, 아래처럼 서로 다른 각도의 검색어를
순서대로 여러 번 시도할 것 — 앞선 검색어에서 이미 원문이 확인되면 뒤 검색어는
생략해도 된다:
${BOOK_EXCERPT_QUERY_TEMPLATES.map((q, i) => `  ${i + 1}. ${q({ name: "<책 제목>", attribution: "<저자>" })}`).join("\n")}
이렇게 검색어를 바꿔가며 여러 번 시도했는데도 원문이 노출된 페이지를 끝내 못
찾으면, 그때만 아래 【인용구 확인】 규칙대로 패러프레이즈로 전환할 것 — 검색을
한 번만 해보고 바로 포기하지 말 것.`;
}

const BIBLIO_RULE = `【책 존재/서지정보 확인 — 특정 사이트 이름이 아니라 "내용 형태"로 판단할 것 —
매우 중요】 책 제목·저자 같은 사실을 인용할 때, 교보문고·알라딘·예스24처럼
이름을 정해둔 특정 사이트만 검색하지 말 것 — 그렇게 하면 절판/독립출판/
도서관 전용 자료/외국 원서 번역서처럼 그런 사이트에 없는 책은 계속 검증에
실패하게 되고, 결과적으로 그 사이트들에 잘 걸리는 유명 베스트셀러 위주로만
추천이 쏠리게 된다. 대신 검색은 넓게 하되(서점, 출판사 공식 페이지, 국립중앙
도서관 등 도서관 정보, 신뢰 가능한 서평 등 어디든 상관없이), 검색으로 찾은
페이지가 아래 조건을 만족하는지 "내용"으로 판단할 것:
  - 그 페이지 안에 "책 제목 + 저자 + 출판사 + 출간연도(또는 ISBN)"가 함께
    명시되어 있으면 서지정보가 확인된 것으로 본다 — 어느 사이트인지는
    상관없다.
  - 여러 사람이 자유롭게 고쳐 쓸 수 있는 위키형 구조(나무위키류)나, 익명
    질문·답변/커뮤니티 게시판형 구조(레딧류)의 페이지는 신뢰도가 낮다고
    판단할 것 — 이건 사이트 "이름"이 아니라 "편집 가능한 위키 구조인지",
    "익명 게시판 구조인지"로 판단하는 것이다.
  - 동영상 플랫폼(유튜브 등) 페이지도 마찬가지로 신뢰도가 낮다고 판단할 것 —
    자막이나 설명란에 서지정보가 텍스트로 적혀 있어도, 영상 본편 내용과 실제로
    일치하는지는 원문 대조가 불가능하기 때문이다. 위키형·커뮤니티형·동영상
    플랫폼은 서지정보 확인의 "보조 자료"로만 쓰고, 절대 그 하나만으로 단독
    출처를 채택하지 말 것 — 반드시 서지정보를 텍스트로 갖춘 다른 페이지(서점,
    출판사, 도서관, 서평 등 형태 무관)를 추가로 검색해서 그 페이지를 실제
    각주로 쓸 것.
  - 서로 다른 독립된 두 개 이상의 페이지에서 같은 서지정보(제목+저자+출판사)가
    일치하게 확인되면 신뢰도가 더 높다고 볼 것.`;

const EXCERPT_VERIFY_RULE = `【인용구(원문 구절) 확인은 책 존재 확인과 별개로 반드시 따로 할 것 — 매우
중요】 위에서 책 존재/서지정보가 확인됐다고 해서 인용구까지 검증된 것으로
착각하지 말 것. 인용하려는 문장(또는 그와 매우 유사한 표현)이 검색된 "텍스트"
페이지 안에 실제로 노출되어 있는지 별도로 확인할 것 — 동영상 페이지의
자막/설명란은 이 확인 용도로 쓰지 말 것(원문 대조 불가능).
  - 원문 노출로 인정하는 페이지 유형(예시일 뿐 아래와 형태만 같으면 어느
    사이트든 상관없다): 전자책 미리보기(리디북스, 전자책 샘플 등), 서점의
    "책속으로"/샘플 보기, 구글도서 미리보기, 발행처의 발췌 페이지 — 즉 원문
    편집 권한이 있는 주체(서점·전자책 플랫폼·발행처)가 올린 페이지.
  - 원문 노출로 인정하지 않는 페이지 유형: 줄거리·소개·요약만 있고 원문
    자체는 안 보이는 페이지("이 책은 ~에 대한 이야기다" 같은 요약 문장은
    원문이 아니다), 동영상 페이지, 위키형/커뮤니티 게시판형 페이지의 재인용,
    개인 블로그의 리뷰/독후감 페이지(티스토리, 네이버 블로그, 브런치 등 —
    원문을 그대로 옮긴 것처럼 보여도 원문 편집 권한이 없는 개인이 옮긴
    것이라 정확한 일치를 보장할 수 없다).
  - 【서점 상세페이지 안에서도 섹션을 구분할 것 — 매우 중요】 서점 상세페이지는
    보통 "책 소개"(출판사가 책을 홍보하려고 쓴 카피)와 "책속으로"/"미리보기"
    (실제 책 본문)가 다른 섹션으로 나뉜다. 반드시 후자에서만 인용할 것 —
    "책 소개" 카피는 페이지에 실제로 있는 텍스트라도 책 "본문"이 아니다.
    "저자는", "이 책은", "작가는"처럼 3인칭으로 저자·책을 소개하는 문장으로
    시작하거나 "강연", "호응을 얻었다", "베스트셀러", "화제를 모았다" 같은
    광고성 수사가 들어간 문장은 절대 "인상 깊은 구절"로 인용하지 말 것 —
    그건 마케팅 카피이지 책 속 문장(대사·서술·조언 등)이 아니다.
  - 그 구절이 실제로 노출된 걸 확인했으면 따옴표로 직접 인용하고 [n] 각주를
    붙일 것.
  - 확인하지 못했으면 절대 따옴표로 직접 인용하지 말 것. 하지만 그렇다고
    "인상 깊은 구절" 같은 항목 자체를 빼버리지도 말 것 — 대신 "이 책에서는
    대략 이런 취지의 이야기를 한다"처럼 패러프레이즈(간접 인용, 따옴표 없이)로
    반드시 그 자리를 채워 쓸 것. 별도의 "직접 인용 아님" 안내 문구는 화면에
    덧붙이지 말 것 — 따옴표를 썼는지 안 썼는지 자체로 구분되게만 하면 된다.
    직접 인용(따옴표)은 원문이 실제로 확인된 경우로만 제한하되, 항목 자체는
    검증 여부와 무관하게 항상 채워져 있어야 한다.`;

const SEPARATE_SEARCH_RULE_BOOK_EXCERPT = `책 제목, 저자, 인상 깊은 구절은 서로 다른 사실이니 검색도 한 번의 포괄적인
질의로 뭉뚱그리지 말고 각각 따로 검색해서, 전체 글이 출처 하나에만 계속
의존하지 않게 할 것.`;

const SEPARATE_SEARCH_RULE_BOOK = `책 제목과 저자는 서로 다른 사실이니 검색도 한 번의 포괄적인 질의로 뭉뚱그리지 말고 각각 확인해서, 전체 글이 출처 하나에만 계속 의존하지 않게 할 것.`;

function buildPrompt(input: GenerateEssayInput, elements: CoreTaskInfo["task_elements"], notes: ResearchNotes | null = null): string {
  const continuityBlock = input.previousOutputText
    ? `
【중요 — 반드시 지킬 것】
아래 [이전 버전]은 이전에 이미 확정된 전체 내용이다. 등장인물 이름, 고민·사연의
구체적 내용(장소·상황·세부사항), 이미 처방/선택한 책의 제목·저자·구절 등 이미
정해진 구체적 사실은 절대 바꾸거나 새로 지어내지 말고 그대로 이어서 사용할 것.
오직 아래 [재생성 요청]에서 명시적으로 요청한 부분만 그 사실 위에서 수정할 것.

[이전 버전]
${input.previousOutputText}
`.trim() + "\n\n"
    : "";

  const sectionsBlock = elements.map((el, i) => `${i + 1}. "${el.label}" — ${el.description}`).join("\n");

  // 안내문이 조사/작성 항목을 나열한 단계(analyze.ts가 required_items로 추출)는
  // 항목 구조를 강제한다 — 항목은 절대 하드코딩이 아니라 안내문에서 동적으로 온다.
  // "sections"(조사·탐구형)는 "### 항목명" 소제목 + 조사 자료 형식, "flowing"(편지·
  // 감상문 등)은 소제목 없이 항목을 빠짐없이 다루라고만 지시한다.
  const structuredEls = elements.filter(isStructuredElement);
  const newspaperEls = elements.filter((el) => inferDeliverableForm(el) === "newspaper" && (el.required_items?.length ?? 0) >= 1);
  const flowingEls = elements.filter(
    (el) => el.items_format === "flowing" && (el.required_items?.length ?? 0) >= 2 && !newspaperEls.includes(el)
  );
  const materialLabels = structuredEls.map((el) => el.label);
  const newspaperBlock = newspaperEls.length
    ? "\n" +
      newspaperEls
        .map((el) => buildNewspaperBlock({ label: el.label, requiredItems: el.required_items ?? [], materialLabels }))
        .join("\n\n") +
      "\n"
    : "";
  // 안내문에 분량이 없으면 모델이 길게 쓰는 경향(gpt-5-mini 실측 4,300자)이 있어 시간·비용이 커지므로 기본 분량을 준다.
  // 안내문의 분량 조건은 처음부터 숫자로 못박는다(gpt-5-mini는 지시 없이 쓰면 하한을 밑돌거나 상한을 넘기는 일이 잦고, 사후 재시도는 시간·비용이 든다).
  // 목표는 범위 안쪽으로 잡는다: 범위가 있으면 가운데, 하한만 있으면 하한의 약 1.15배, 상한만 있으면 상한의 약 80%.
  const lengthTargetLines = elements
    .filter((e) => e.target_length)
    .map((e) => {
      const { min, max, unit, counts_spaces } = e.target_length!;
      const uw = unit === "words" ? "단어(words)" : counts_spaces ? "자(공백 포함)" : "자(공백 제외)";
      // 조사→글쓰기의 글쓰기(최소 추론)는 목표보다 길게 나오는 경향이 있어 목표를 낮춰 준다. 다만 계수를 0.65로 더 낮춰도 첫 글 길이는 그대로였다(감상문 목표 720~880자에서 첫 글 921~1103자 9/9 초과) — 모델이 목표 숫자보다 내용 구성에 따라 길이를 정한다.
      // 하한만 있고 예시 답안 분량이 적혀 있으면(writing_guide "총 136단어") 그 분량을 목표로 한다 — 실측(2026-10-22): 하한 120단어·예시 136단어 과제에 194~345단어.
      const example = min > 0 && !max && qualityFixesOn() ? exampleLength(input.coreTaskInfo.writing_guide, unit) : null;
      const exMax = example && example >= min ? Math.round(example * 1.2) : null;
      const base = min > 0 && max > 0 ? Math.round((min + max) / 2) : example && example >= min ? example : min > 0 ? Math.round(min * 1.15) : Math.round(max * 0.8);
      const goal = notes ? Math.round(base * 0.8) : base;
      // 하한만 있는 조건("120단어 이상")은 위로 열려 있어 실측(2026-10-22) 예시 답안 136단어인 과제에 329단어가 나왔다 — 하한~1.4배를 권장 범위로 준다(검사는 여전히 하한만).
      const rangeText =
        min > 0 && max > 0
          ? `${min}~${max}${uw}`
          : min > 0
            ? exMax
              ? `${min}~${exMax}${uw}(채점 기준 ${min}${uw} 이상, 예시 답안 약 ${example}${uw} — 예시보다 길게 쓰지 말 것)`
              : qualityFixesOn()
              ? `${min}${uw} 이상(되도록 ${min}~${Math.round(min * 1.4)}${uw} — 예시 답안 분량이 있으면 그 분량에 맞출 것)`
              : `${min}${uw} 이상`
            : `${max}${uw} 이하`;
      return `- "${e.label}" 단계: ${rangeText} — 목표 약 ${goal}${uw}. 반드시 이 범위 안에 들어오게 쓰되, 분량을 채우려고 문장을 늘어놓지 말고 필요한 내용(필수 항목·사실·근거)으로 채울 것.`;
    });
  const lengthTargetBlock = lengthTargetLines.length ? `\n【분량 — 반드시 지킬 것】\n${lengthTargetLines.join("\n")}\n` : "";
  // 안내문에 분량이 없는 단계는 역할·항목 수로 정한 권장 범위를 준다(length-plan.ts) — 모든 단계에 같은 글자 수를 주지 않고, 부족 여부는 글자 수가 아니라 필수 항목 충족으로 본다.
  const formOn = formRequirementsOn();
  const formCtx = { requirements: input.coreTaskInfo.requirements, guide: input.coreTaskInfo.writing_guide, labels: input.coreTaskInfo.task_elements.map((e) => e.label) };
  const guideLines = lengthGuideLines(elements, formOn ? formCtx : undefined);
  // 요구사항·작성 기준은 문장마다 적용 단계를 나눠 준다 — 발표 시간·대본 금지처럼 만들지 않는 결과물의 조건이 개요에 섞이지 않게(requirement-scope.ts).
  // 조사 프롬프트는 이 범위 나누기의 대상이 아니다(조사 단계는 이번 변경에서 건드리지 않는다).
  const scopeAll = input.coreTaskInfo.task_elements;
  const scopeGenerated = elements.map((e) => e.label);
  const requirementsText = formOn
    ? renderScopedRequirements(input.coreTaskInfo.requirements, scopeAll, scopeGenerated)
    : input.coreTaskInfo.requirements.map((r) => `- ${r}`).join("\n") || "(명시된 요구사항 없음)";
  const guideText = formOn ? renderScopedGuide(input.coreTaskInfo.writing_guide, scopeAll, scopeGenerated) : input.coreTaskInfo.writing_guide;
  const formLimitBlock = formOn ? buildFormLimitBlock(elements.map((el) => ({ label: el.label, reqs: requirementsForElement(el, formCtx.requirements, formCtx.guide, formCtx.labels) }))) : "";
  const defaultLengthBlock =
    lengthTargetBlock +
    (guideLines.length
      ? "\n[분량 가이드 — 안내문에 분량 지시가 없는 단계] 필요한 내용을 다 담기 위한 권장 범위다. 항목마다 필요한 설명·근거는 충분히 쓰되 같은 사실을 반복해 분량을 채우지 말고, 반대로 중요한 설명을 빼서 줄이지도 말 것." + (formOn ? " 단, [안내문의 작성 기준·양식·예시]나 형식 조건에 예시 분량·줄·문장·문단 수가 있으면 그것이 이 권장 범위보다 우선한다.\n" : "\n") + guideLines.join("\n") + "\n"
      : "");
  const formRulesBlock = buildFormRulesBlock(elements);
  // 안내문이 표·그래프를 요구한 단계는 글 안에 마크다운 표로 직접 쓰게 한다(data-visual.ts) — 해당 단계가 없으면 빈 문자열.
  // 안내문이 자료 종류를 제한했으면(그림·그래프·표만 등) 그 제한을 명시한다 — 전달만으로는 26회 중 9회가 사진·영상을 넣었다(data-visual.ts).
  const visuals = qualityFixesOn()
    ? visualPolicy([...input.coreTaskInfo.requirements, input.coreTaskInfo.writing_guide ?? "", ...elements.map((e) => e.description)])
    : { allowed: [], banned: [] };
  const visualBlock = visualPolicyInstruction(visuals, elements.filter((e) => inferDeliverableForm(e) || isSceneLikeElement(e)).map((e) => e.label));
  // 학생이 직접 수행한 것을 적는 단계(자료 수집·조사 기록)는 "지어내지도, 비우지도 않기" 규칙을 따로 준다(own-activity.ts).
  const ownRecordBlock = qualityFixesOn() && elements.some(isOwnRecordStep) ? `\n${OWN_RECORD_RULES}\n` : "";
  const dataTableBlock = qualityFixesOn()
    ? dataTableInstruction(elements.filter((el) => needsDataTable(el, input.coreTaskInfo.requirements, input.coreTaskInfo.writing_guide, elements.length === 1)).map((el) => el.label))
    : "";
  // 책 과제인가 / 인상 깊은 구절(원문 인용)을 요구하는가에 따라 검색·인용 규칙의 범위를 정한다(essay/excerpt-need.ts).
  const isBookPrompt = !!input.presetBook || needsBookCandidateSelection(input, elements);
  const wantsExcerpt = needsExcerpt([input.coreTaskInfo.topic, ...input.coreTaskInfo.requirements, ...elements.flatMap((e) => [e.label, e.description]), input.instructions ?? ""]);
  const searchRulesBlock = !isBookPrompt
    ? SEARCH_CALL_RULE_GENERIC
    : [
        SEARCH_CALL_RULE_BOOK,
        wantsExcerpt ? excerptSearchRule() : "",
        BIBLIO_RULE,
        wantsExcerpt ? EXCERPT_VERIFY_RULE : "",
        wantsExcerpt ? SEPARATE_SEARCH_RULE_BOOK_EXCERPT : SEPARATE_SEARCH_RULE_BOOK,
      ]
        .filter(Boolean)
        .join("\n\n");
  // 제출용 보고서(탐구 보고서 등)는 소제목 구조는 같지만 조사 자료(불릿 메모) 규칙 대신 보고서 문단 규칙을 준다(deliverable.ts isFinalReportForm).
  const fixes = qualityFixesOn();
  // 장면 번호 소제목으로 쓰는 단계(스토리보드 등)는 조사 자료도 문단 보고서도 아니다 — 장면 블록이 따로 지시한다.
  const sceneEls = formOn ? structuredEls.filter(isSceneListElement) : [];
  const reportEls = fixes ? structuredEls.filter((el) => !isResearchMaterialStep(el) && !sceneEls.includes(el)) : [];
  const materialEls = structuredEls.filter((el) => !reportEls.includes(el) && !sceneEls.includes(el));
  const sceneBlock = buildSceneBlock(sceneBlockInputs(sceneEls));
  const structuredBlock = structuredEls.length
    ? `\n【필수 항목 구조 — 반드시 지킬 것】 아래 단계는 안내문이 요구한 필수 항목이 정해져 있다. ` +
      `단계 제목("## 단계 이름") 바로 아래부터, 각 항목을 정확히 "### <항목명>" 소제목(항목명은 아래 ` +
      `글자 그대로, 순서도 그대로 — 번호·기호·꾸밈말을 앞뒤에 붙이지 말 것)으로 나눠 쓰고, 어떤 ` +
      `항목도 빼거나 합치지 말 것. 항목마다 실제 내용이 있어야 한다(소제목만 쓰고 비워두지 말 것). ` +
      (reportEls.length === 0 && sceneEls.length === 0 ? `이 단계는 하나의 긴 글이 아니라 항목별로 구조화된 조사 자료다.\n` : "\n") +
      structuredEls
        // 괄호 설명을 항목 줄에 붙이면 모델이 그걸 소제목에 그대로 베낀다(실측 2026-10-30: "### 해결 방안 (제출용 글 — 항목마다 문단)").
        // 설명은 다음 줄에 따로 적어 소제목으로 옮겨 붙을 자리를 없앤다.
        .map(
          (el) =>
            `- "${el.label}" 단계의 필수 항목(이 순서대로): ${el.required_items!.join(" → ")}` +
            (!fixes || sceneEls.includes(el) ? "" : reportEls.includes(el) ? `\n  이 단계는 제출용 글이다. 항목마다 문단으로 쓴다(이 설명을 소제목에 적지 말 것).` : `\n  이 단계는 조사 자료다. 항목마다 사실을 정리한다(이 설명을 소제목에 적지 말 것).`)
        )
        .join("\n") +
      (materialEls.length ? `\n${RESEARCH_MATERIAL_RULES}` : "") +
      (reportEls.length ? `\n${REPORT_SECTION_RULES}` : "") +
      "\n"
    : "";
  // 출처 목록 항목(예: "신뢰할 수 있는 출처 3개 이상")은 시스템이 확인된 출처로 채운다 — generateEssay()가 required_items에서 떼어 둔다.
  const sourceItemBlock = (input.sourceListItems?.length ?? 0) > 0
    ? `\n[출처 목록 항목] ${input.sourceListItems!.map((s) => `"${s.label}" 단계의 "${s.item}"`).join(", ")} 항목은 시스템이 실제로 확인한 출처 목록으로 자동으로 채운다. 이 항목의 소제목·목록·주소는 쓰지 말고, 본문의 사실 문장에만 근거 번호를 붙일 것.\n`
    : "";
  const scope = promptRuleScope({
    subject: input.subject,
    texts: [input.coreTaskInfo.topic, ...input.coreTaskInfo.requirements, ...elements.flatMap((e) => [e.label, e.description]), input.instructions ?? ""],
    hasPresetSubject: !!input.presetSubject,
  });
  const flowingBlock = flowingEls.length
    ? `\n【필수 항목 포함 — 반드시 지킬 것】 아래 단계는 안내문이 요구한 세부 항목이 정해져 있다. ` +
      `소제목으로 쪼개지 말고 하나의 자연스러운 글로 쓰되, 아래 항목을 하나도 빠뜨리지 말고 모두 다룰 것.\n` +
      flowingEls
        .map((el) => `- "${el.label}" 단계에서 다룰 항목: ${el.required_items!.join(" / ")}`)
        .join("\n") +
      "\n"
    : "";

  const languageNotes = elements
    .map((el) => {
      const lang = detectElementLanguage(input.subject, el);
      return lang ? `- "${el.label}" 단계는 반드시 ${lang}로 작성할 것(한국어로 쓰지 말 것) — 제목이 있다면 제목도 포함해서 전부. 본문 문장에는 한글을 한 글자도 섞지 말고, 대상·제품·인물 이름도 영어로 옮겨 쓸 것(예: 휴대용 태양열 조리기 → portable solar cooker).` : null;
    })
    .filter((line): line is string => line !== null)
    .join("\n");
  // 외국어로 쓰는 단계가 없으면 "전부 한국어"를 분명히 말한다 — 말하지 않으면 슬라이드 제목·발표 대본을 영어로 쓴 적이 있다(korean-guard.ts).
  const koreanRule = currentOutputLang() === "en"
    ? '- 맨 위 요약 불릿도 영어로 쓸 것. 단, "## 단계 이름" 줄과 "### 항목 이름" 소제목 줄은 위에 주어진 이름을 한국어 그대로 쓰고(프로그램이 이 줄로 단계·항목을 찾는다), 그 아래 본문만 영어로 쓸 것.'
    : koreanGuardOn()
    ? languageNotes
      ? "- 위에 언어가 지정되지 않은 나머지 단계는 모두 한국어로 쓸 것."
      : "- 모든 단계는 한국어로 쓸 것 — 발표 대본·슬라이드 제목·화면 문구·스토리보드 장면 설명도 포함. 영어 제목이나 영어 문장을 쓰지 말 것(외국 인물·기관 이름은 한국어로 쓰고 필요하면 괄호에 원어 병기)."
    : "";
  const languageBlock = languageNotes
    ? `\n【언어 규칙 — 반드시 지킬 것】\n${languageNotes}\n${koreanRule ? `${koreanRule}\n` : ""}(이 지시문이나 [학생이 추가로 입력한 지침] 자체는 한국어여도 되지만, 위에서 지정한 단계의 실제 제출용 본문은 반드시 그 언어로만 쓸 것.)\n`
    : koreanRule
      ? `\n【언어 규칙 — 반드시 지킬 것】\n${koreanRule}\n`
      : "";
  // 영어 이름 옮겨 쓰기 지시는 실제로 영어로 쓰는 단계가 있을 때만 넣는다(국어 과제에 넣었더니 발표 대본을 통째로 영어로 썼다 — 2026-10-24).
  const englishNameNote =
    !koreanGuardOn() || elements.some((el) => detectElementLanguage(input.subject, el)?.startsWith("English"))
      ? " — 단, 영어로 쓰는 단계에서는 자연스러운 영어 이름으로 옮겨 쓰고 한글을 한 글자도 섞지 말 것"
      : "";

  return `
${continuityBlock}너는 한국 고등학생이 수행평가로 제출할 글을 대신 써주는 도우미다.
이 과제는 아래처럼 여러 단계(차시)로 구성되어 있다. 학생이 그대로 제출해도 될 만큼
완성도 있는 원고를, 아래 단계 전부 다 한 번에 작성하라.

각 단계 앞에 정확히 "## <단계 이름>" 형태의 마크다운 제목을 붙이고, 그 아래 그
단계의 완성된 본문을 쓸 것. 단계 이름은 아래 목록에 주어진 이름을 토씨 하나
틀리지 않고 그대로 사용할 것 (이후 이 제목을 기준으로 프로그램이 자동으로
단계를 구분한다).

[과목] ${input.subject}
[과제 주제] ${input.coreTaskInfo.topic}
[요구사항]
${requirementsText}
[작성해야 할 단계들]
${sectionsBlock}
${fixes ? writingGuideBlock(guideText) : ""}${defaultLengthBlock}${formLimitBlock}${structuredBlock}${sceneBlock}${sourceItemBlock}${flowingBlock}${newspaperBlock}${formRulesBlock}${dataTableBlock}${visualBlock}${ownRecordBlock}${languageBlock}${input.instructions ? `[학생이 추가로 입력한 지침 — 특정 단계에 필요한 실제 정보(예: 무작위로 뽑은 친구의 고민 원문, 실제 자료 등)가 여기 포함되어 있을 수 있으니 반드시 확인해서 해당 단계에 반영할 것]\n${input.instructions}` : ""}
${(notes?.book ?? input.presetBook) ? `[처방/추천할 책이 이미 정해짐 — 반드시 그대로 따를 것] 책을 언급/추천/처방하는 단계에서는 반드시 다음 책을 그대로 쓸 것: 『${(notes?.book ?? input.presetBook)!.title}』${(notes?.book ?? input.presetBook)!.author ? ` (저자: ${(notes?.book ?? input.presetBook)!.author})` : ""}. 이미 주제 적합성과 추천 다양성을 함께 고려해 선택된 책이니 다른 책으로 바꾸지 말 것.` : ""}
${input.avoidanceInstruction ? `[다양성 확보를 위한 회피 지시 — 반드시 반영할 것]\n${input.avoidanceInstruction}` : ""}
${input.recentBookGuidance && !input.presetBook ? `\n${input.recentBookGuidance}\n` : ""}
${input.presetSubject ? `\n[이미 정해진 다룰 대상 — 반드시 그대로 따를 것] 이 과제에서 다룰 대상은 「${input.presetSubject.name}」${input.presetSubject.userSpecified ? " (학생이 직접 지정함)" : " (조건 검증과 다양성을 함께 고려해 이미 선정됨)"}이다. 이름은 이 표기 그대로만 쓰고(다른 음역·표기 금지${englishNameNote}), 대상을 선정한 이유를 쓰는 단계를 포함해 모든 단계를 이 대상 기준으로 쓰고, 다른 대상으로 바꾸거나 다른 후보를 함께 다루지 말 것. confirmed_subject도 이 대상이다.\n` : input.recentSubjectGuidance && !input.presetBook ? `\n${input.recentSubjectGuidance}\n` : ""}
${input.personalization ? `[학생 개인화 정보 — 자연스럽게 녹여낼 것]\n${input.personalization}` : ""}
${input.revisionInstructions ? `[재생성 요청 — 학생이 이전 결과물에 만족하지 못해 다시 요청함. 아래 방향을 반드시 반영해 새로 작성할 것]\n${input.revisionInstructions}` : ""}

작성 규칙:
1. 모든 단계는 하나의 이야기 흐름 안에서 자연스럽게 이어지되, 등장인물 이름·
   구체적 사실(책 제목, 저자, 인용구 등)은 전체 단계에 걸쳐 완전히 일관되게
   유지할 것 — 한 단계에서 정한 이름/사실을 다른 단계에서 절대 바꾸지 말 것.
2. 어떤 단계를 쓰려면 학생 본인이 아닌 제3자의 실제 정보(예: 무작위로 뽑은
   친구의 고민 원문)가 필요할 수 있다. 그 정보가 위 [학생이 추가로 입력한
   지침]에 있다면 반드시 그 내용을 써서 완성할 것. 이름을 제외한 정보(고민
   내용, 상황 등)는 절대 "[여기에 ~~ 넣으세요]" 같은 대괄호 빈칸을 남기지
   말고, 지침에 있는 실제 내용으로 채우거나 그 내용을 바탕으로 자연스럽게
   완성할 것. 실존 인물의 "이름"만은 예외 — 단, 그 인물에게 직접 말을 거는
   글(편지 등)에서만 아래 [실존 인물 이름 처리] 규칙에 따라 이름을 모르면
   지어내지 말고 "[이름]"으로 빈칸 처리할 것. 그 인물에 "대해" 3인칭으로
   서술하는 단계(고민 분석 등)에서는 이 빈칸을 쓰지 말고 그냥 "친구"로
   지칭할 것 — [실존 인물 이름 처리] 규칙의 C 항목 참고.
   이름이 아닌 다른 핵심 정보 자체가 지침에 전혀 없어서 이 단계를 도저히 쓸
   수 없는 경우에만, 그 단계 본문 맨 앞에 "[자료부족: 무엇이 필요한지 한 줄]"
   이라고 적을 것 (다른 용도로는 이 표기를 절대 쓰지 말 것).
   대괄호는 오직 세 가지 용도로만 쓸 것: 검색 결과 각주(반드시 [1], [2]처럼
   순수 숫자만), 위에서 설명한 "[자료부족: ...]" 표기, 그리고 [실존 인물
   이름 처리] 규칙에 따른 "[이름]" 표기. "[2차시 원문]", "[친구가 알려준
   정보]"처럼 어떤 내용의 출처를 표시하려고 스스로 새 대괄호 표기를 지어내지
   말 것 — 그런 건 그냥 각주 없이 자연스러운 문장으로 쓸 것.
3. 맨 위에 불릿 3줄로 전체 내용을 요약해서 먼저 제시할 것 (학생이 스스로 검증할
   수 있도록 — 글의 "내용"만 요약하고, 어떻게 썼는지에 대한 언급은 절대 넣지 말 것).
   본문에 실제로 없는 내용(예: 본문 계산에서 명시적으로 제외한 조건, 본문이
   언급하지 않은 결과나 수치)을 요약에서 새로 지어내 넣지 말 것 — 요약은
   반드시 본문에 실제로 쓴 내용만 압축한 것이어야 한다.
4. 그 요약 바로 다음 줄부터 구분선이나 "본문" 같은 라벨 없이 곧바로 첫 단계로 이어서 쓸 것.
5. 안내문·요구사항에 명시된 항목(예: "인상 깊은 구절"처럼 특정 요소를 포함하라는
   지시)은 검증 성공 여부와 상관없이 절대 통째로 생략하지 말 것. 검증되면 아래
   규칙대로 직접 인용해서 채우고, 검증이 안 되면 아래 규칙대로 패러프레이즈로
   바꿔서라도 반드시 그 항목을 채울 것 — "항목을 아예 안 쓰는 것"은 어떤 경우에도
   올바른 대응이 아니다.

${notes ? "" : searchRulesBlock}
${ANTI_AI_TONE_RULES}
${fixes ? FORM_FIDELITY_RULES : ""}
${scope.factualRigor ? FACTUAL_RIGOR_RULES : ""}
${scope.achievement ? ACHIEVEMENT_INTERPRETATION_RULES : ""}
${COPYRIGHT_RULES}
${NO_META_COMMENTARY_RULE}
${notes ? "" : NO_REFERENCE_LIST_RULE}
${notes ? "" : sourceEconomyRule(requiredSourceCount([...input.coreTaskInfo.requirements, ...elements.map((e) => e.description)]), !!input.presetBook)}
${elements.length > 1 || structuredEls.length > 0 ? NO_STEP_REPETITION_RULE : ""}
${CITATION_JUDGMENT_RULE}
${scope.personAndPerspective ? PERSPECTIVE_RULE : ""}
${scope.personAndPerspective ? REAL_PERSON_NAME_RULE : ""}
${MULTI_DELIVERABLE_SEPARATION_RULE}
${notes ? `${factSheetRules()}${notes.excerpt?.verified ? "\n- 예외: [사실 노트]의 「책 속 구절(원문 확인됨)」 문장은 원문이 확인됐다. '인상 깊은 구절' 같은 항목에서는 이 문장을 큰따옴표로 한 글자도 바꾸지 말고 그대로 인용하고 그 번호를 붙인다. 다른 책 속 문장은 따옴표로 인용하지 말 것." : ""}

[사실 노트]
${factSheetText(notes.facts)}` : ""}
`.trim();
}

// 과제 설명에 책 관련 키워드가 있을 때만 후보 선택 단계를 돌린다 — 책 추천이
// 없는 과제(개인 경험 에세이 등)까지 매번 그라운딩 호출을 추가하면 헛수고다.
// generate-plan.ts의 needsFactVerification()과 같은 종류의 판별(완벽하지
// 않아도 명백한 신호만 잡는 수준으로 충분).

function needsBookCandidateSelection(input: GenerateEssayInput, elements: CoreTaskInfo["task_elements"]): boolean {
  if (BOOK_TASK_HINT_PATTERN.test(input.coreTaskInfo.topic)) return true;
  if (input.coreTaskInfo.requirements.some((r) => BOOK_TASK_HINT_PATTERN.test(r))) return true;
  return elements.some((e) => BOOK_TASK_HINT_PATTERN.test(e.description) || BOOK_TASK_HINT_PATTERN.test(e.label));
}

// 10종 수행평가 교차 테스트(2026-09-13)에서 발견된 심각한 문제: 독서 비평문
// 과제에서 학생이 [학생이 추가로 입력한 지침]에 "내가 실제로 읽은 책은
// 『사피엔스』다"라고 명시했는데도, BOOK_TASK_HINT_PATTERN("독서"라는 단어
// 때문에 매치)이 needsBookCandidateSelection을 트리거해서 selectBookCandidate()
// 가 실행됐고, 그 함수는 학생 지침을 보지 않고 자체적으로 책 후보를 검색해서
// 완전히 다른 책(『총, 균, 쇠』)을 골라버렸다. selectBookCandidate()는 "AI가
// 책을 추천/처방하는" 시나리오(책처방전 등)를 위한 것이라 학생이 이미 실제로
// 읽은 책을 지정한 경우에는 맞지 않는다 — 이 경우엔 후보를 새로 고를 필요
// 자체가 없다. 그래서 후보 선택보다 먼저 지침에 책 제목이 겹낫표(『』/《》)로
// 명시돼 있는지 확인하고, 있으면 그 책으로 바로 고정한다(후보 검색 생략).
const QUOTED_BOOK_TITLE_PATTERN = /[『《]([^』》]{1,60})[』》]/;

function extractStudentSpecifiedBook(instructions: string | undefined): { title: string; author?: string } | null {
  if (!instructions) return null;
  const m = QUOTED_BOOK_TITLE_PATTERN.exec(instructions);
  if (!m) return null;
  const title = m[1].trim();
  if (!title) return null;
  // "유발 하라리의 『사피엔스』"처럼 겹낫표 바로 앞에 "~의"로 저자가 붙는
  // 흔한 표기만 가볍게 인식한다(못 찾아도 author는 그냥 undefined로 둔다).
  const before = instructions.slice(0, m.index);
  const authorMatch = /([가-힣]{2,4}(?:\s[가-힣]{2,6}){0,1})의\s*$/.exec(before);
  const author = authorMatch ? authorMatch[1].trim() : undefined;
  return { title, author };
}

/** presetBook(추천 후보든 학생이 직접 지정한 책이든)이 있는데 실제 결과물이
 * 다른 책을 언급했으면 감지한다 — presetBook 프롬프트 지시만으로는 100%
 * 지켜지지 않는다는, 이 프로젝트에서 반복 확인된 패턴에 대한 안전장치. */
function detectPresetBookMismatch(
  sections: RawSection[],
  presetBook?: { title: string; author?: string }
): boolean {
  if (!presetBook) return false;
  const mentioned = extractDistinctBookMentions(sections);
  if (mentioned.length === 0) return false;
  return !mentioned.some((b) => normalizeBookTitleKey(b.title) === normalizeBookTitleKey(presetBook.title));
}

/** 선정된 대상(presetSubject)과 다른 대상을 다뤘는지. 단계 B가 뽑은 confirmed_subject를 canonical로 비교하고, 못 뽑았으면 본문에 이름이 있는지 본다. */
function detectPresetSubjectMismatch(attempt: Attempt, preset?: GenerateEssayInput["presetSubject"]): boolean {
  if (!preset) return false;
  if (attempt.confirmedSubject) {
    const k = canonicalize(attempt.confirmedSubject).key;
    if (k === preset.key || sameEntity(k, preset.key)) return false;
    // 같은 대상의 다른 한글 음역(예: 카사스/까사스)은 위반으로 보지 않는다 — 이름 표기 유사도가 높으면 같은 대상.
    return bigramSimilarity(compactName(attempt.confirmedSubject), compactName(preset.name)) < 0.5;
  }
  const text = attempt.sections.map((sec) => compactName(sec.content)).join("");
  return !text.includes(compactName(preset.name));
}

interface BookCandidate {
  title: string;
  author?: string;
  reason?: string;
}

export const SECTIONS_META_SCHEMA: Schema = withoutContent(SECTIONS_SCHEMA);

export const BOOK_CANDIDATES_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    candidates: {
      type: Type.ARRAY,
      description: "제안한 책 후보 목록(3~5권).",
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "책 제목(겹낫표 등 부호는 빼고)." },
          author: { type: Type.STRING, description: "저자. 모르면 빈 문자열." },
          reason: { type: Type.STRING, description: "이 주제에 어울리는 이유 한 줄." },
        },
        required: ["title"],
      },
    },
  },
  required: ["candidates"],
};

/**
 * 후보 생성 ↔ 검증 분리(3단계) — 실제로 발견된 버그: 본문 생성(stageA)이
 * 책을 "쓰면서" 한 번에 고르다 보니, 검증하기 쉬운 소수의 유명한 책으로
 * 수렴하는 편향이 있었다(서로 다른 주제인데도 계속 『데미안』이 나옴). 이
 * 함수는 본문을 쓰기 전에 후보 3~5권을 먼저 제안받고, "최근 추천 빈도가
 * 낮은 후보"를 코드가 결정적으로 고른다(추가 LLM 호출 없이) — 완전히 새
 * 검증 단계가 아니라, 기존 인용구 검증(quoteVerificationByTitle) 앞에 놓이는
 * 사전 단계일 뿐이다. 여기서 하는 "검증 가능성" 판단은 모델의 자체 추정일
 * 뿐 진짜 검증이 아니다 — 실제 검증은 지금까지처럼 본문 생성 이후
 * verifyExcerpt()/verifyAuthorAttribution()가 한다(순서 변경 없음).
 *
 * 실패(응답 파싱 실패, 후보 0개 등)하면 null을 반환한다 — 이 경우
 * generateEssay()는 이 단계가 아예 없었던 것처럼 기존 동작(본문 생성이 책을
 * 직접 고름)으로 자연스럽게 폴백한다.
 */
/** 후보 목록에서 같은 사용자·같은 수행평가·전체 이력을 반영해 한 권을 고른다(모델 호출 없음). */
async function pickBookFromCandidates(input: GenerateEssayInput, candidates: BookCandidate[]): Promise<{ title: string; author?: string } | null> {
  try {
    const parsed = { candidates };
    // 코드가 결정(추가 LLM 호출 없음): 공통 선정 점수(src/lib/selection/)로 같은 사용자·같은 수행평가·전체 이력을 반영한다.
  // 책은 과제와 무관하게 몇 권으로 수렴하는 편향이 실측돼(『데미안』) 다른 수행평가의 기록도 약하게(crossScope) 본다.
  const history = input.selection?.history ?? (await loadSelectionHistory("book"));
  const bookCandidates = parsed.candidates.map((c, i) => ({
    name: c.title,
    key: normalizeBookTitleKey(c.title),
    group: c.author ?? null,
    // 모델이 준 순서를 적합도의 대리 신호로 쓴다(앞쪽일수록 높음). 하한(0.6) 아래로 내려가지 않는다.
    fit: Math.max(0.6, 1 - 0.08 * i),
  }));
  const sel = selectFromCandidates(bookCandidates, history, {
    userId: input.selection?.userId,
    scopeKey: input.selection?.scopeKey,
    rng: input.selection?.rng,
    config: { weights: { user: 1.0, scope: 1.4, group: 0, crossScope: 0.35 } },
  });
  if (!sel) return null;
  if (sel.fallbackUsed) console.warn(`[selection] 책 선정 fallback tier=${sel.tier} 선택="${sel.picked.name}"`);
  const picked = parsed.candidates[bookCandidates.findIndex((c) => c.key === sel.picked.key)] ?? parsed.candidates[0];
  console.log(
    `[generateEssay] selectBookCandidate: 후보=${JSON.stringify(sel.ranking.map((r) => ({ title: r.name, pen: Number(r.penalty.toFixed(2)) })))} 선택="${picked.title}" tier=${sel.tier}`
  );
  return { title: picked.title, author: picked.author || undefined };
  } catch (err) {
    console.error("[generateEssay] 책 선정 점수 계산 실패", err);
    return null;
  }
}

/** 후보를 검색 없이(모델이 아는 책 중에서) 제안받아 고른다. 실존 여부는 이어지는 조사 호출이 확인하고, 틀리면 기존 경로로 폴백한다. */
export async function selectBookCandidateFast(input: GenerateEssayInput): Promise<{ title: string; author?: string } | null> {
  const prompt = `
고등학생 수행평가의 "책 처방/추천" 단계를 위해 후보 책을 제안해줘. 최종 선택은 네가 하지 않는다.
[과제 주제] ${input.coreTaskInfo.topic}
${
    qualityFixesOn()
      ? `[단계 설명 — 책이 누구의 어떤 문제를 도와야 하는지 여기서 찾을 것]\n${input.coreTaskInfo.task_elements.map((e) => `- ${e.label}: ${e.description}`).join("\n")}\n`
      : ""
  }${input.instructions ? `[학생이 추가로 입력한 지침]\n${input.instructions}\n` : ""}${input.recentBookGuidance ? `\n${input.recentBookGuidance}\n` : ""}
규칙:${qualityFixesOn() ? "\n- 단계 설명이 책으로 도울 대상을 정해 두었으면(예: \"친구의 문제 상황에 도움을 줄 책\") 지침 속 여러 고민 중 그 대상의 고민에 직접 도움이 되는 책만 고르고, 가장 잘 맞는 책을 맨 앞에 둘 것." : ""}
- 네가 실존을 확실히 아는 책만 3~5권. 한국어로 번역·출간돼 서점에서 구하기 쉽고 고등학생이 읽을 수 있는 책을 우선한다. 확실하지 않은 책은 넣지 마라(지어낸 책 금지).
- 후보를 비워 두면 안 된다 — 딱 맞는 책이 떠오르지 않으면 이 고민과 가까운 주제의 널리 알려진 스테디셀러에서라도 3권을 고른다.
- 같은 저자나 거의 같은 소재로 몰지 말고 서로 다른 각도의 책을 섞는다.
- 각 후보에 제목, 저자(한국어 표기), 이 주제에 어울리는 이유 한 줄.
`.trim();
  try {
    const res = await generate({ label: "generateEssay:selectBookCandidate:fast", role: "main", prompt, schema: BOOK_CANDIDATES_SCHEMA, effort: "low" });
    const parsed = JSON.parse(res.text || "{}") as { candidates?: BookCandidate[] };
    if (!parsed.candidates || parsed.candidates.length === 0) {
      console.warn(`[generateEssay] 빠른 책 후보가 비어 있음 — 검색 기반 선정으로 폴백 (응답 앞부분: ${(res.text || "").slice(0, 160)})`);
      return null;
    }
    console.log(`[generateEssay] 책 후보(검색 없이 제안): ${JSON.stringify(parsed.candidates.map((c) => c.title))}`);
    return pickBookFromCandidates(input, parsed.candidates);
  } catch (err) {
    console.error("[generateEssay] 빠른 책 후보 제안 실패(검색 기반 선정으로 폴백)", err);
    return null;
  }
}

async function selectBookCandidate(input: GenerateEssayInput): Promise<{ title: string; author?: string } | null> {
  const topic = input.coreTaskInfo.topic;
  const prompt = `
너는 고등학생 수행평가의 "책 처방/추천" 단계를 위해 후보 책을 제안하는
리서처다. 최종 선택은 네가 하지 않는다 — 후보를 제안하는 것까지만 한다.

[과제 주제] ${topic}
${input.instructions ? `[학생이 추가로 입력한 지침]\n${input.instructions}` : ""}
${input.recentBookGuidance ? `\n${input.recentBookGuidance}\n` : ""}

이 주제/고민에 실제로 어울리는 실존하는 책 후보를 3~5권 제안할 것 — 반드시
실시간 웹 검색 도구를 최소 한 번 이상 실제로 호출해서 각 후보가 실존하는
책인지 확인할 것(지어낸 책 금지). 온라인에서 원문 발췌(전자책 미리보기,
서점의 "책속으로" 등)를 찾기 쉬워 보이는지도 대략 판단해서 언급할 것 — 단,
이건 다음 단계에서 실제로 검증할 것이므로 여기서는 예비 판단일 뿐이다.

후보 다양성을 위해, 같은 저자나 거의 같은 소재로만 몰지 말고 서로 다른
각도의 책을 섞어서 제안할 것. 각 후보마다 책 제목, 저자, 이 주제에 어울리는
이유를 자유 서술로 밝힐 것.
`.trim();

  try {
    const investigation = await generate({
      label: "generateEssay:selectBookCandidate:investigate",
      role: "main",
      prompt: prompt,
      search: { force: true, maxCalls: 3 }, // 실존하는 책을 확인하는 단계 — 검색이 반드시 필요
    });
    const investigationText = investigation.text;
    if (!investigationText) return null;

    const extraction = await generate({
      label: "generateEssay:selectBookCandidate:extract",
      role: "lite",
      prompt: `아래는 어떤 조사자가 책 후보를 제안하며 남긴 메모다. 이 메모에서 실제로 제안된 책 후보들을 구조화해서 뽑아줘.\n\n[메모]\n${investigationText}`,
      schema: BOOK_CANDIDATES_SCHEMA,
    });
    const raw = extraction.text;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { candidates: BookCandidate[] };
    if (!parsed.candidates || parsed.candidates.length === 0) return null;

    return pickBookFromCandidates(input, parsed.candidates);
  } catch (err) {
    console.error("[generateEssay] selectBookCandidate 실패(본문 생성이 직접 고르도록 폴백)", err);
    return null;
  }
}

interface Attempt {
  sections: RawSection[];
  sources: SourceRef[];
  /** 각 단계가 "[자료부족: ...]"으로 시작하면 그 이유를 담는다. */
  insufficientReasons: string[];
  /** 글 맨 위 불릿 3줄 요약. stage B가 못 뽑았으면 빈 배열. */
  summaryLines: string[];
  /** 이 과제가 인물/사건 등을 자유롭게 선정한 유형이면 그 대상 이름. 선정할
   * 필요가 없었거나 stage B가 못 뽑았으면 빈 문자열 — FINAL_PERSON 일관성
   * 강제(신문 제작 등 external_production 단계에 그대로 넘겨 고정시키는 용도). */
  confirmedSubject: string;
  /** 이 시도에서 쓴 조사 노트(품질 재시도에서 다시 조사하지 않고 재사용). null이면 조사 경로를 쓰지 않았거나 실패했다. */
  notes?: ResearchNotes | null;
}

/** 단계별 각주 개수 로그용 — 각주가 어느 후처리에서 사라지는지 추적한다(내용은 남기지 않는다). */
function countMarkers(sections: { content: string }[]): number {
  return sections.reduce((n, s) => n + (s.content.match(/\[\d+\]/g)?.length ?? 0), 0);
}

// ── 조사 → 글쓰기 ────────────────────────────────────────────────────────────
export interface ResearchNotes {
  facts: Fact[];
  queries: string[];
  /** 책 과제: 조사가 확인(정정)한 책. 글쓰기는 이 책만 다룬다. */
  book?: { title: string; author?: string };
  /** 서지(제목·저자)가 인용 페이지 본문에서 코드로 확인됐는가. true면 별도의 검색 기반 저자 확인을 건너뛴다. */
  bookVerified?: boolean;
  /** 구절을 요구하는 책 과제: 조사와 동시에 미리 해 둔 책 속 구절 확인 결과(글을 쓴 뒤 확인·재작성하지 않는다). */
  excerpt?: VerificationResult;
}

/** 구절을 요구하는 책 과제도 빠른 책 선정 + 조사→글쓰기로 쓰고, 구절 확인은 조사와 동시에 한다.
 * 예전 방식(검색 기반 책 선정 → 한 번에 쓰기 → 구절 확인 → 전체 재작성)은 실측 72~143초였다. ESSAY_BOOK_EXCERPT=legacy로 되돌린다. */
function preExcerptOn(): boolean {
  return process.env.ESSAY_BOOK_EXCERPT !== "legacy";
}

function withExcerptFact(notes: ResearchNotes, ex: VerificationResult, bookTitle: string): ResearchNotes {
  if (!(ex.verified && ex.confirmedExcerpt && ex.source)) return { ...notes, excerpt: ex };
  const fact: Fact = { id: `F${notes.facts.length + 1}`, fact: `『${bookTitle}』 속 구절(원문 확인됨): "${ex.confirmedExcerpt}"`, url: ex.source.url, title: ex.source.title };
  return { ...notes, facts: [...notes.facts, fact], excerpt: ex };
}

/** 안내문이 원문 구절을 요구하는 과제인가(요구하면 책 과제도 기존 경로 — 인용구 검증이 필요하다). */
/** writing_guide에 적힌 예시 답안 분량("예시 분량: 총 136단어", "총 (136) 단어")을 읽는다. */
function exampleLength(guide: string | undefined, unit: "chars" | "words" | undefined): number | null {
  if (!guide) return null;
  // "예시"가 들어간 문장 안의 마지막 "N단어/N자"를 쓴다 — 실측(2026-10-24): "예시 분량은 용도 약 2문장, …, 전체 약 136단어이다"처럼 숫자가 멀리 있었다.
  const num = unit === "words" ? /\(?\s*(\d{2,4})\s*\)?\s*(?:단어|words?)/gi : /\(?\s*(\d{2,5})\s*\)?\s*자(?![가-힣])/g;
  for (const sentence of guide.split(/(?<=[.!?。])\s+|\n+/)) {
    if (!/예시|견본|sample/i.test(sentence)) continue;
    const all = [...sentence.matchAll(num)];
    const n = Number(all.at(-1)?.[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function taskNeedsExcerpt(input: GenerateEssayInput, elements: CoreTaskInfo["task_elements"]): boolean {
  return needsExcerpt([input.coreTaskInfo.topic, ...input.coreTaskInfo.requirements, ...elements.flatMap((e) => [e.label, e.description]), input.instructions ?? ""]);
}

/** 글쓰기 호출의 추론 강도. 검색이 없어 minimal이 가능하고, low는 글이 목표보다 짧게 나오는 경향이 측정됐다(810자 vs 목표 1,200자 이상).
 * ESSAY_WRITE_EFFORT=low로 바꿔 품질을 비교할 수 있다(minimal이 ChatGPT 대비 품질 차이의 한 원인일 수 있다는 추정 — 측정 전). */
export function writeEffort(): "minimal" | "low" {
  return process.env.ESSAY_WRITE_EFFORT === "low" ? "low" : "minimal";
}

const RESEARCH_MIN_FACTS = 4;

/**
 * 조사 호출: 검색은 여기서만 한다. 출력은 사실 노트(JSON)뿐이라 짧다. 모델이 적은 URL은 검색이 실제로 열어 본 페이지 목록과 대조해 지어낸 주소를 버린다.
 * 실패(사실이 너무 적음·페이지 목록 없음·오류)하면 null — 호출부가 기존 한 번 호출 경로로 돌아간다.
 */
/**
 * 저자 표기를 글에 쓸 한국어 이름 하나로 정리한다: "파울로 코엘료 (Paulo Coelho)" → "파울로 코엘료",
 * "Kevin Leman (한국어 표기: 케빈 리먼)" → "케빈 리먼"(실측 2026-10-22: 이 표기가 글에 그대로 들어감). 한국어 이름이 없으면 원래 값.
 */
function koreanAuthorName(raw: string): string {
  // 공저 구분 기호는 쉼표로 통일한다("기시미 이치로; 고가 후미타케"가 글에 그대로 들어감 — 실측 2026-10-22).
  const outside = raw.replace(/\([^)]*\)/g, "").replace(/\s*[;·]\s*/g, ", ").trim();
  if (/[가-힣]/.test(outside)) return outside;
  const inner = [...raw.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].replace(/^[^:：]{0,12}[:：]/, "").split(/,|\/|또는/)[0].trim()).find((s) => /[가-힣]/.test(s));
  return inner || raw;
}

/** 외부 제작 경로(generate-plan.ts)도 같은 조사 단계를 쓴다 — 출처를 모델이 쓴 링크가 아니라 검색이 연 페이지에서 코드가 붙이기 위해서다. */
export function researchForTask(input: GenerateEssayInput, elements: CoreTaskInfo["task_elements"]): Promise<ResearchNotes | null> {
  return researchOnce(input, elements);
}

async function researchOnce(input: GenerateEssayInput, elements: CoreTaskInfo["task_elements"]): Promise<ResearchNotes | null> {
  const items = elements
    .map((e) => `- "${e.label}": ${e.description}${e.required_items?.length ? ` (다룰 항목: ${e.required_items.join(" / ")})` : ""}`)
    .join("\n");
  const bookTask = !!input.presetBook;
  // 안내문이 "서로 다른 근거 N개"를 요구하면 조사에 그 수와 학생의 입장을 전한다(evidence-slots.ts). 해당 없으면 slots=0 — 프롬프트가 예전 그대로다.
  const evidence: EvidencePlan =
    evidenceSlotsOn() && !bookTask
      ? planEvidence(
          {
            topic: input.coreTaskInfo.topic,
            requirements: input.coreTaskInfo.requirements,
            writing_guide: input.coreTaskInfo.writing_guide,
            task_elements: elements,
          },
          input.instructions
        )
      : NO_EVIDENCE_PLAN;
  const evidenceBlock = evidenceResearchBlock(evidence);
  // 출처별로 묶어 쓰면 주소·제목이 출처당 한 번만 나와 출력 토큰이 줄어든다(출력 단가가 입력의 8배). ESSAY_RESEARCH_FORMAT=flat이면 예전 사실 단위 형식.
  const grouped = process.env.ESSAY_RESEARCH_FORMAT !== "flat";
  const bookBlock = bookTask
    ? `[조사할 책 — 이 책만 조사할 것] 『${input.presetBook!.title}』${input.presetBook!.author ? ` (저자: ${input.presetBook!.author})` : ""}
- 이 책이 실존하는지, 저자·출판사·출간연도를 검색으로 확인한다. book.title과 book.author는 위에 적힌 한국어 표기를 그대로 유지한다(원제·영어 제목으로 바꾸지 말 것). 제목이나 저자가 실제로 다르게 확인될 때만 한국어 표기로 정정하고, 실존하지 않으면 book.exists를 false로 한다.
- 처음 1~2개 사실은 서지 사실(제목·저자·출판사·출간연도)로 쓰고, 그 사실의 근거 페이지 항목에는 페이지에 인쇄된 제목과 저자 표기를 그대로 printed_title, printed_author에 적는다(페이지에 있는 글자 그대로, 번역·의역 금지).${
    qualityFixesOn() ? `\n- 서지 사실 문장은 "『제목』은 저자가 쓰고 출판사가 연도에 펴낸 책이다."처럼 한 문장으로 쓴다. "표지에 ~로 표기되어 있다", "~로 소개되어 있다" 같은 표현은 쓰지 않는다.` : ""
  }
- 나머지 사실은 줄거리·주제·인물·작가 소개로 6~8개. 책 속 문장(인용문)은 모으지 않는다.${
    qualityFixesOn()
      ? `\n- 책이 실제 역사적 사건(예: 4·19혁명, 제주 4·3, 부마민주항쟁)을 다루면, 그 사건의 핵심 사실(날짜·장소·사람·무슨 일이 있었고 어떻게 끝났는지) 4~6개를 역사 기관·백과사전·교과 자료 페이지에서 따로 찾아 넣는다 — 서점 책 소개만으로는 사건 내용을 쓸 수 없다(실측: 카드뉴스가 "긴장이 고조되었다"처럼 사건 없이 흐릿해졌다).`
      : ""
  }
- 인물·지명은 한국어 번역본에서 쓰이는 표기로 쓰고, 확실하지 않으면 원어 표기를 괄호로 병기한다(예: 다아시(Darcy)). 음역을 지어내지 말 것.
`
    : "";
  const prompt = `
고등학생 수행평가 글쓰기에 쓸 "사실 노트"를 만들어줘. 글은 다른 호출이 쓰니 너는 사실만 모은다.
[과목] ${input.subject}
[과제 주제] ${input.coreTaskInfo.topic}
[요구사항]
${input.coreTaskInfo.requirements.map((r) => `- ${r}`).join("\n") || "(명시된 요구사항 없음)"}
[써야 할 단계]
${items}
${bookBlock}${input.presetSubject ? `[다룰 대상 — 이 대상만 조사할 것] ${input.presetSubject.name}\n` : ""}${input.instructions ? `[학생이 입력한 내용]\n${input.instructions}\n` : ""}${
    qualityFixesOn() && input.coreTaskInfo.writing_guide ? `[안내문의 작성 기준 — 채점 기준이 요구하는 내용을 빠짐없이 조사할 것]\n${input.coreTaskInfo.writing_guide}\n` : ""
  }${evidenceBlock ? `${evidenceBlock}\n` : ""}
규칙:${
    qualityFixesOn()
      ? `
- 과제가 사회문제·인물·대상 하나를 골라 다루는 형식이면 하나만 골라 그것만 조사한다(여러 주제를 섞지 말 것). "기사에서 찾으라"는 과제면 최근 기사 하나를 골라 그 기사의 제목·매체·날짜를 첫 사실로 담는다.
- 사실은 서로 다른 페이지 3곳 이상에서 고를 것(한 페이지에 몰지 말 것 — 그 페이지 하나가 열리지 않으면 근거가 모두 사라진다).
- 고등학교 교과서·수업에서 다루는 수준의 사실을 고를 것. 대학 교재 수준의 이론·수치(예: 반응 엔탈피 값, 전문 학술 용어)는 안내문이 요구하지 않으면 담지 말 것.`
      : ""
  }
- 검색으로 확인한 사실만 쓴다. 사실 10~14개를, 위 각 단계·항목마다 최소 2개씩 고르게 담을 것.${evidenceBlock ? "" : " 논설·토론이면 찬성·반대 양쪽 근거를 함께 담을 것."}
- 각 사실은 한국어 한 문장으로, 연도·수치·이름 같은 확인 가능한 값을 포함한다. 출처에 없는 값은 쓰지 않는다.${
    qualityFixesOn()
      ? `
- 항목마다 그 항목의 중심이 되는 핵심 사실(대표 사건·인물·발명·제도·원리)을 먼저 담고, 세부 통계·주변 사실은 그다음에 담을 것. 검색 결과에 우연히 나온 주변 사실(예: 다른 주제의 연표)로 항목을 채우지 말 것. 특정 사이트를 정해 두고 찾지 말고, 사실마다 url은 이번 검색에서 실제로 열린 페이지 주소만 쓸 것(기억하는 주소를 쓰면 그 사실은 버려진다).
- 사실 문장은 사실 자체를 평서문으로 쓴다("1769년 제임스 와트가 증기기관을 개량했다."). "이 글은 ~라고 지적한다", "해당 기사에서 인용되었다", "~라고 보고하고 있다"처럼 출처를 주어로 쓰지 말고, 괄호 속 해석·평가를 덧붙이지 말 것.`
      : ""
  }
- 같은 사실을 중복하지 말고, 서로 다른 신뢰도 높은 페이지(공식 기관·원문·신뢰 매체 우선)에서 고른다. 위키형·블로그·동영상은 다른 근거가 없을 때만.
- 기관·포털의 첫 화면 주소(예: https://www.me.go.kr/ , .../main.do)는 근거가 될 수 없다. 그 사실이 실제로 적힌 보도자료·통계표·기사 페이지의 주소를 쓸 것.
- url은 검색 중 실제로 열어 본 페이지 주소여야 하고, title은 그 페이지 제목이다.${grouped ? " 같은 페이지에서 나온 사실은 한 항목의 facts에 모아 url과 title을 한 번만 쓴다." : ""}
- 검색은 1번만 한다(그 한 번에 쿼리 2~3개). 조사할 것은 과제 주제의 사실뿐이다 — 수행평가 방식·발표 시간·분량·모둠 같은 과제 지시 자체는 검색하지 않는다.
${
    bookTask
      ? grouped
        ? '- 아래 JSON 객체만 출력한다(설명·코드펜스 금지): {"book":{"title":"확인된 제목","author":"확인된 저자","exists":true},"sources":[{"url":"https://...","title":"...","printed_title":"(서지 사실이 있는 페이지만)","printed_author":"(서지 사실이 있는 페이지만)","facts":["사실 문장","사실 문장"]}]}'
        : '- 아래 JSON 객체만 출력한다(설명·코드펜스 금지): {"book":{"title":"확인된 제목","author":"확인된 저자","exists":true},"facts":[{"fact":"...","url":"https://...","title":"...","printed_title":"(서지 사실만)","printed_author":"(서지 사실만)"}]}'
      : grouped
        ? '- 아래 JSON 배열만 출력한다(설명·코드펜스 금지): [{"url":"https://...","title":"...","facts":["사실 문장","사실 문장"]}]'
        : '- 아래 JSON 배열만 출력한다(설명·코드펜스 금지): [{"fact":"...","url":"https://...","title":"..."}]'
  }
`.trim();
  try {
    const res = await generate({
      label: "generateEssay:research",
      role: "main",
      prompt,
      search: { force: true, maxCalls: 2 },
      effort: "low",
    });
    // 검색 응답은 제공자가 인라인 링크를 걷어낸 text를 주는데, 그 정리가 JSON 안의 [..](..)·괄호를 건드릴 수 있어 원문(rawText)을 먼저 읽는다.
    const readBook = (t: string) => parseBookResearch(t);
    const parsedBook = bookTask ? (res.rawText ? readBook(res.rawText) : null) ?? readBook(res.text) : null;
    if (bookTask && (!parsedBook || !parsedBook.book.exists)) {
      console.warn("[generateEssay] 책 조사: 책이 실존하지 않거나 응답을 읽지 못함 — 기존 경로로 폴백");
      return null;
    }
    const fromRaw = !parsedBook && res.rawText ? parseFactJson(res.rawText) : [];
    const rawFacts = parsedBook ? parsedBook.facts : fromRaw.length > 0 ? fromRaw : parseFactJson(res.text);
    // 국내 출처 범위면 해외 페이지에서 나온 사실은 글쓰기 전에 뺀다(출처 범위 설정 — source-scope.ts).
    const scopedRaw = keepInScope(rawFacts, currentSourceScope());
    if (scopedRaw.length < rawFacts.length) console.warn(`[generateEssay] 국내 출처 범위: 해외 페이지 사실 ${rawFacts.length - scopedRaw.length}개 제외`);
    const facts = buildFacts(scopedRaw, res.grounding?.consulted);
    const queries = res.grounding?.queries ?? [];
    if (rawFacts.length === 0) {
      console.warn(`[generateEssay] 조사 응답에서 사실 목록을 읽지 못함: 길이=${res.text.length} 앞부분=${JSON.stringify(res.text.slice(0, 160))} 끝부분=${JSON.stringify(res.text.slice(-80))}`);
    } else if ((facts?.length ?? 0) < Math.min(RESEARCH_MIN_FACTS, rawFacts.length)) {
      // 모델이 적은 주소가 검색이 연 페이지 목록과 안 맞아 사실이 버려진 경우의 진단(주소만 남긴다).
      console.warn(
        `[generateEssay] 조사 사실 대부분이 버려짐: 모델이 적은 주소=${JSON.stringify(rawFacts.slice(0, 4).map((f) => f.url))} 검색이 연 페이지 예=${JSON.stringify((res.grounding?.consulted ?? []).slice(0, 4))}`
      );
    }
    console.log(
      `[generateEssay] 조사: queries=${JSON.stringify(queries)} 검색이 연 페이지=${res.grounding?.consulted?.length ?? 0} 사실(검증 통과)=${facts?.length ?? "목록없음"} model=${res.provider}/${res.model}`
    );
    if (!facts || facts.length < RESEARCH_MIN_FACTS) return null;
    // 저자 원어 병기("파울로 코엘료 (Paulo Coelho)")는 글에 그대로 옮겨져 어색하다 — 한글 이름이 남으면 괄호를 뗀다.
    const rawAuthor = parsedBook?.book.author || input.presetBook?.author;
    const author = rawAuthor && qualityFixesOn() ? koreanAuthorName(rawAuthor) : rawAuthor;

    // 요구된 근거 수만큼 서로 다른 페이지에서 사실이 나오지 않았으면 딱 한 번만 보강 조사한다(검색 1회 추가, 약 5~10초).
    // 실패하거나 쓸 사실이 없으면 1차 결과를 그대로 쓴다 — 폴백으로 되돌아가지 않는다.
    let allFacts = facts;
    let allQueries = queries;
    if (needsMoreEvidence(evidence, allFacts.map((f) => f.url))) {
      console.warn(
        `[generateEssay] 근거 보강 조사 시작: 요구 근거=${evidence.slots}개 확보한 페이지=${distinctHostCount(allFacts.map((f) => f.url))}곳 입장=${evidence.stance ?? "지정 없음"}`
      );
      try {
        const more = await generate({
          label: "generateEssay:research2",
          role: "main",
          prompt: `${prompt}\n\n${evidenceTopUpBlock(evidence, allFacts.map((f) => f.fact))}`,
          search: { force: true, maxCalls: 1 },
          effort: "low",
        });
        const moreRaw = more.rawText ? parseFactJson(more.rawText) : [];
        const moreFacts = buildFacts(keepInScope(moreRaw.length > 0 ? moreRaw : parseFactJson(more.text), currentSourceScope()), more.grounding?.consulted);
        const added = moreFacts ? mergeFacts(allFacts, moreFacts) : allFacts;
        console.log(
          `[generateEssay] 근거 보강 결과: 새 사실 ${added.length - allFacts.length}개 추가(받은 사실 ${moreFacts?.length ?? 0}개) 서로 다른 페이지=${distinctHostCount(added.map((f) => f.url))}곳`
        );
        allFacts = added;
        allQueries = [...allQueries, ...(more.grounding?.queries ?? [])];
      } catch (err) {
        console.error("[generateEssay] 근거 보강 조사 실패(1차 결과로 진행)", err);
      }
    }
    return { facts: allFacts, queries: allQueries, book: parsedBook ? { title: parsedBook.book.title || input.presetBook!.title, author } : undefined };
  } catch (err) {
    console.error("[generateEssay] 조사 호출 실패(기존 경로로 폴백)", err);
    return null;
  }
}

/**
 * 같은 수행평가(cluster_id) + 같은 책/대상 + 같은 지침이면 앞선 학생의 조사 노트를 그대로 쓴다(검색 요금 + 12~15초 절감).
 * 노트는 공개 사실과 근거 주소뿐이고, 글은 학생마다 따로 쓰므로 결과물의 다양성 로직(회피 지시·선정)은 그대로 적용된다.
 * 근거 페이지 링크 확인은 캐시 적중이어도 매번 다시 한다(죽은 링크 각주는 기존처럼 제거).
 */
async function researchWithCache(input: GenerateEssayInput, elements: CoreTaskInfo["task_elements"]): Promise<ResearchNotes | null> {
  const key = researchCacheKey({
    scopeKey: input.selection?.scopeKey,
    subject: input.subject,
    book: input.presetBook,
    subjectName: input.presetSubject?.name,
    instructions: input.instructions,
  });
  const hit = await getCachedResearch(key, RESEARCH_MIN_FACTS);
  if (hit) {
    console.log(`[generateEssay] 조사 노트 재사용(캐시 적중): 사실=${hit.facts.length}개 — 조사 호출 생략`);
    return hit;
  }
  const fresh = await researchOnce(input, elements);
  if (fresh && worthCaching(fresh)) await putCachedResearch(key, { facts: fresh.facts, queries: fresh.queries, book: fresh.book });
  return fresh;
}

const FACT_SHEET_RULES = `
[사실 노트 사용 규칙 — 반드시 지킬 것]
- 이 글의 모든 사실(연도·수치·이름·사건·통계)은 아래 [사실 노트]에 있는 것만 쓴다. 노트에 없는 사실은 만들지 말고, 필요하면 일반적인 서술이나 학생 본인의 의견·계획으로 쓴다.
- 노트의 사실을 쓴 문장 끝에 그 번호를 [F3]처럼 붙인다(두 사실을 합치면 [F1][F4]). 번호는 노트에 있는 것만 쓰고, 문장마다 새 번호를 지어내지 않는다. 같은 사실을 여러 번 써도 된다.
- 노트의 사실을 전부 쓸 필요는 없다. 위에 적힌 분량에 맞게 이 글에 꼭 필요한 사실만 골라 쓰고, 분량을 넘기면 안 된다(분량을 넘기는 것이 가장 흔한 실패다).
- 노트의 문장을 그대로 베끼지 말고 이 글의 형식과 문체에 맞게 다시 쓴다. 사실이 아닌 의견·감상·계획 문장에는 번호를 붙이지 않는다.
- 책을 다루는 글이면 글 안에서 책 제목(『』)과 저자를 반드시 한 번 밝히고 그 문장에 서지 사실의 번호를 붙인다. 판본·번역자·표지 표기 같은 서지 세부는 길게 다루지 말 것. 책 속 문장을 따옴표로 직접 인용하지 말 것(원문을 확인하지 못했다) — 줄거리·주제를 자기 말로 쓴다.
- 노트의 사실을 쓴 문장에 번호가 없으면 안 된다(번호 없이 연도·수치를 쓰지 말 것). 출처 목록·참고문헌·"(출처: …)"는 쓰지 말 것(출처는 시스템이 번호로 붙인다).
`.trim();

// 품질 개선판(ESSAY_QUALITY_FIXES, 기본 켜짐). 실측(2026-10-20, 8건)에서 고친 점:
// - 번호가 붙은 사실을 "~라는 기록이 있다/보도가 있다/평가가 있다"처럼 전달형으로 돌려 써서 글 전체가 자료 요약처럼 읽혔다 → 확인된 사실은 단정형으로.
// - "책 제목·저자를 밝히고 서지 번호를 붙여라"가 "『데미안』(민음사, 전영애 번역)을 읽었다는 사실을 먼저 밝힌다[1]" 같은 서지 문장을 만들었다 → 글 흐름 속 한 번 언급.
// - 감상·의견 문장에도 번호를 붙여 엉뚱한 출처가 "생각"의 근거로 달렸다 → 의견 문장에는 번호 금지를 앞에 둔다.
// - 노트 밖 사실을 전부 막아 교과서 핵심(예: 산업혁명의 증기기관)이 노트에 없으면 글에서 빠졌다 → ESSAY_WRITER_KNOWLEDGE=general일 때만 일반 지식 허용(기본은 예전처럼 금지).
export function factSheetRules(): string {
  if (!qualityFixesOn()) return FACT_SHEET_RULES;
  const scopeLine = writerGeneralKnowledgeOn()
    ? "- 연도·수치·통계·인용·고유한 세부 사실은 아래 [사실 노트]에 있는 것만 쓴다. 노트에 없는 내용은 교과서·개론서 수준으로 널리 알려진 일반 설명(대표 사건·인물·개념의 뜻)만 쓰고, 그 문장에는 번호를 붙이지 않는다. 노트에 없는 통계·퍼센트·인용문·세부 날짜는 쓰지 않는다."
    : "- 이 글의 모든 사실(연도·수치·이름·사건·통계)은 아래 [사실 노트]에 있는 것만 쓴다. 노트에 없는 사실은 만들지 말고, 필요하면 일반적인 서술이나 학생 본인의 의견·계획으로 쓴다.";
  return `
[사실 노트 사용 규칙 — 반드시 지킬 것]
${scopeLine}
- 노트의 사실을 쓴 문장 끝에 그 번호를 [F3]처럼 붙인다(두 사실을 합치면 [F1][F4]). 번호는 노트에 있는 것만 쓰고, 문장마다 새 번호를 지어내지 않는다. 같은 사실을 여러 번 써도 된다.
- 학생의 의견·감상·느낀 점·다짐·계획 문장에는 번호를 붙이지 않는다(그 생각의 근거가 출처에 있는 것이 아니다).
- 노트의 사실은 확인된 사실이니 "~했다", "~이다"처럼 분명하게 쓴다. "~라는 기록이 있다", "~라는 보도가 있다", "~라는 평가가 있다", "~로 알려져 있다"처럼 전달하는 말투로 돌려 말하지 말 것(근거는 번호가 보여 준다). 노트 문장에 "이 글은", "해당 기사는" 같은 말이 있어도 옮기지 말고 사실만 쓴다.
- 노트의 사실을 전부 쓸 필요는 없다. 이 글에 꼭 필요한 사실만 골라 위 분량 안에서 쓰고(분량을 넘기는 것이 가장 흔한 실패다), 고른 사실은 나열하지 말고 서로 원인·결과·비교로 이어서 설명한다.
- 노트의 문장을 그대로 베끼지 말고 이 글의 형식과 문체에 맞게 다시 쓴다.
- 책을 다루는 글이면 책 제목(『』)과 저자를 글의 흐름 속에서 자연스럽게 한 번 언급하고(예: "헤르만 헤세의 『데미안』은 …") 그 문장에 서지 사실의 번호를 붙인다. 출판사·번역자·출간 연도·판본은 안내문이 요구하지 않으면 쓰지 않는다. 책 속 문장을 따옴표로 직접 인용하지 말 것(원문을 확인하지 못했다) — 줄거리·주제를 자기 말로 쓴다.
- 노트의 연도·수치를 쓴 문장에는 반드시 번호를 붙인다. 출처 목록·참고문헌·"(출처: …)"·주소는 쓰지 말 것(출처는 시스템이 번호로 붙인다).
`.trim();
}

async function generateOnce(
  input: GenerateEssayInput,
  elements: CoreTaskInfo["task_elements"]
): Promise<Attempt> {
  const labels = elements.map((e) => e.label);
  // 사실 조사가 필요 없는 창작·계산·기획형 과제에는 검색을 강제하지 않는다(검색 호출당 요금 — search-policy.ts).
  const wantSearch = needsFactSearch(
    input.coreTaskInfo.topic,
    ...input.coreTaskInfo.requirements,
    ...elements.flatMap((e) => [e.label, e.description]),
    input.instructions
  );
  const isBook = !!input.presetBook || needsBookCandidateSelection(input, elements);

  // 검색이 필요한 비(非)책 과제는 "조사 → 글쓰기"로 나눈다: 조사 호출이 사실 노트(사실+근거 페이지)를 만들고, 글쓰기 호출은 검색 없이 그 노트로만 쓴다.
  // 출처 번호는 코드가 사실 번호에서 바꿔 붙이므로 "검색은 했는데 인용이 0개"가 구조적으로 생기지 않고, 그 재생성 재시도(약 25초)가 필요 없다.
  // 조사에 실패하면(사실 4개 미만·페이지 목록 없음) 기존 한 번 호출 경로로 돌아간다.
  const excerptTask = isBook && taskNeedsExcerpt(input, elements);
  const bookResearch = isBook && !!input.presetBook && (!excerptTask || preExcerptOn()) && process.env.ESSAY_BOOK_PIPELINE !== "legacy";
  const useResearchWrite = wantSearch && (!isBook || bookResearch) && process.env.ESSAY_PIPELINE !== "legacy";
  let notes: ResearchNotes | null = input.researchNotes ?? null;
  if (useResearchWrite && input.researchNotes === undefined) {
    const book = input.presetBook;
    const [researched, ex] = await Promise.all([
      researchWithCache(input, elements),
      excerptTask && book
        ? verifyExcerpt({ name: book.title, attribution: book.author }, undefined, 0).catch((err) => {
            console.error("[generateEssay] 구절 미리 확인 실패(구절 없이 진행)", err);
            return null;
          })
        : Promise.resolve(null),
    ]);
    notes = researched && ex && book ? withExcerptFact(researched, ex, book.title) : researched;
    if (ex) console.log(`[generateEssay] 구절 미리 확인(조사와 동시): ${ex.verified ? "확인됨" : "확인 못 함 → 따옴표 없이 소개"}`);
  }

  const prompt = buildPrompt(input, elements, notes);
  if (process.env.LOG_PROMPTS === "1") console.log("[generateEssay] prompt:\n" + prompt); // 학생 입력이 섞여 있어 기본은 남기지 않는다

  let validatedSources: SourceRef[];
  let annotated: string;
  let preAnnotated: string;
  let stageB: Awaited<ReturnType<typeof generate>> | null;

  if (notes) {
    // 근거 페이지 확인(HTTP·본문 받기)은 글쓰기와 겹치지 않으므로 글쓰기와 동시에 돌린다.
    const urls = [...new Set(notes.facts.map((f) => f.url))];
    const prefetch = validateSources(urls.map((url, i) => ({ n: i + 1, title: "", url, url_valid: null })));
    // 단계가 여러 개면 단계별로 동시에 쓴다(parallel-write.ts — ESSAY_PARALLEL_WRITE=off로 한 번에 쓰기).
    let writes: Awaited<ReturnType<typeof generate>>[];
    // 단계가 하나뿐이면 단계별 동시 쓰기가 안 걸린다 — 필수 항목이 넉넉하면 항목을 나눠 동시에 쓴다(parallel-write.ts).
    const soloItemGroups =
      labels.length === 1 && process.env.ESSAY_ITEM_PARALLEL !== "off" && elements[0]?.items_format === "sections"
        ? itemGroups(elements[0]?.required_items)
        : [];
    if (soloItemGroups.length > 1) {
      const all = soloItemGroups.flat();
      console.log(`[generateEssay] 항목 나눠 쓰기: ${soloItemGroups.map((g) => g.join("+")).join(" / ")}`);
      const parts = await Promise.all(
        soloItemGroups.map((group, i) =>
          generate({
            label: "generateEssay:write",
            role: "write",
            prompt: `${prompt}

${itemWriteInstruction(labels[0], group, all, i === 0)}`,
            effort: writeEffort(),
          })
        )
      );
      if (parts.some((p) => !p.text)) throw new Error("AI가 빈 응답을 반환했습니다.");
      // 합친 글 하나로 돌려준다 — 아래 mergeParallelParts(단계별 합치기)가 다시 돌면 안 된다. 호출별 토큰·비용은 trace가 따로 센다.
      writes = [{ ...parts[0], text: mergeItemParts(parts.map((p) => p.text), labels[0]) }];
    } else if (parallelWriteOn(labels.length)) {
      // 안내문이 "A를 바탕으로 B"라고 한 단계는 순서대로 쓰고, 뒤 단계에 앞 단계의 완성된 글(사실 번호 포함)을 넘긴다(step-order.ts).
      // 의존 표현이 없으면 웨이브가 하나라 예전처럼 전부 동시에 쓴다.
      const waves = stepOrderOn() ? stepWaves(elements, input.coreTaskInfo.requirements, input.coreTaskInfo.writing_guide) : [labels];
      if (waves.length > 1) console.log(`[generateEssay] 단계 순서: ${waves.map((w) => w.join("+")).join(" → ")}`);
      const byLabel = new Map<string, Awaited<ReturnType<typeof generate>>>();
      const done: { label: string; content: string }[] = [];
      for (const wave of waves) {
        const prev = previousStepsBlock(done);
        const parts = await Promise.all(
          wave.map((l) =>
            generate({
              label: "generateEssay:write",
              role: "write",
              prompt: `${prompt}

${parallelWriteInstruction(l, labels, l === labels[0])}${prev ? `\n\n${prev}` : ""}`,
              effort: writeEffort(),
            })
          )
        );
        wave.forEach((l, i) => {
          byLabel.set(l, parts[i]);
          done.push({ label: l, content: ownSection(parts[i].text, l) });
        });
      }
      writes = labels.map((l) => byLabel.get(l)!);
    } else {
      writes = [await generate({ label: "generateEssay:write", role: "write", prompt, effort: writeEffort() })];
    }
    const write = writes[0];
    if (writes.some((w) => !w.text)) throw new Error("AI가 빈 응답을 반환했습니다.");
    // 글쓰기가 번호를 거의 안 붙였으면(최소 effort에서 가끔 있음) 연도·수치가 같은 사실의 번호를 코드가 붙여 복구한다 — 재생성하지 않는다.
    let written = writes.length > 1 ? mergeParallelParts(writes.map((w) => w.text), labels) : write.text;
    // 번호가 빠진 수치 문장은 항상 복구한다 — 예전에는 "글 전체에 번호가 2개 미만"일 때만 돌려서, 번호를 몇 개만 붙이고
    // 나머지 연도·수치 문장을 맨몸으로 둔 글이 그대로 나갔다(실측 2026-10-30, 오늘 코드로 만든 15편 중 12편).
    // 노트의 사실과 숫자가 겹치는 문장에만 붙이고, 뒤의 문장↔출처 대조가 틀린 연결을 다시 걸러낸다.
    {
      const before = (written.match(/\[F\d+\]/g) ?? []).length;
      const rec = attachFactMarkers(written, notes.facts);
      written = rec.text;
      if (rec.attached > 0) console.log(`[generateEssay] 번호가 빠진 수치 문장 ${rec.attached}개에 사실 번호를 붙임(글쓰기가 붙인 것 ${before}개)`);
    }
    const mapped = mapFactMarkers(written, notes.facts);
    const checked = await prefetch;
    // 책 과제: 서지(제목·저자)가 인용 페이지 본문에 실제로 있으면 코드로 확인 — 별도의 검색 기반 저자 확인(약 10~16초)을 생략한다.
    if (notes.book) {
      notes.bookVerified = confirmBookFromPages(
        notes.facts,
        (u) => getCachedPageText(u) ?? getCachedPageText(checked[urls.indexOf(u)]?.url ?? ""),
        [notes.book.title, notes.book.title.split(/[:(（]/)[0]]
      );
      const biblio = notes.facts.filter((f) => f.printedTitle && f.printedAuthor);
      console.log(
        `[generateEssay] 책 서지 확인(페이지 본문 대조): ${notes.bookVerified ? "확인됨" : "확인 못 함 → 저자 확인을 기존 방식으로"} 책="${notes.book.title}" 서지사실=${biblio.length}개 본문확보=${biblio.filter((f) => getCachedPageText(f.url) ?? getCachedPageText(checked[urls.indexOf(f.url)]?.url ?? "")).length}개 인쇄표기=${JSON.stringify(biblio.map((f) => [f.printedTitle, f.printedAuthor]).slice(0, 2))}`
      );
    }
    const byUrl = new Map(urls.map((u, i) => [normalizeUrl(u), checked[i]]));
    validatedSources = mapped.sources.map((src) => {
      const v = byUrl.get(normalizeUrl(src.url));
      return { n: src.n, title: src.title, url: v?.url ?? src.url, url_valid: v?.url_valid ?? null, tier: v?.tier };
    });
    annotated = mapped.text;
    preAnnotated = annotated;
    stageB = null;
    console.log(
      `[generateEssay] 조사→글쓰기: 사실=${notes.facts.length}개 사용한 출처=${mapped.sources.length}개 모르는번호=${mapped.unknown} 본문각주=${(mapped.text.match(/\[\d+\]/g) ?? []).length} model=${write.provider}/${write.model}`
    );
  } else {
    // 조사가 이미 검색을 쓰고 실패한 뒤의 대체 경로면 검색 상한을 낮추고, "출처 인용 0개" 재시도는 하지 않는다
    // (실측 2026-10-24: 107회 중 2회, 조사 실패 → 대체 경로 → 재시도로 검색 8~10번, 1회 $0.15~0.22). RESEARCH_FALLBACK_SEARCH=full이면 예전처럼.
    const researchFailed = useResearchWrite && input.researchNotes === undefined && process.env.RESEARCH_FALLBACK_SEARCH !== "full";
    if (researchFailed) console.warn("[generateEssay] 조사 실패 → 대체 경로(검색 상한 2회, 출처 없음 재시도 생략)");
    const runStageA = (p: string) =>
      generate({
        label: "generateEssay:stepA",
        role: "main",
        prompt: p,
        search: { force: wantSearch, maxCalls: researchFailed ? 2 : 4 },
      });

    let stageA = await runStageA(prompt);
    let grounding = stageA.grounding;

    // 실제로 관찰된 버그: 검색이 필요한 프롬프트인데도 모델이 검색 도구를
    // 아예 한 번도 호출하지 않고 글을 써버리는 경우가 있다(webSearchQueries=[]
    // — verifyExcerpt()에서 이미 같은 패턴을 겪고 강한 재지시로 고친 적이
    // 있다). 이게 재시도(품질 교정) 단계에서 발생하면 원래 있던 출처까지
    // 통째로 사라져서 4단계 전부 미검증으로 퇴보하는 심각한 회귀로 이어졌다
    // — 그래서 stageA 자체에도 같은 안전장치를 적용한다.
    // 검색을 호출하고도 출처 인용이 하나도 안 붙은 경우(chunks=0)도 같은 문제다 — 검색 결과를 쓴 문장에 출처가 없으면 "신뢰할 수 있는 사실" 요구를 확인할 수 없다(실측: 인물 탐구 글이 통째로 무출처).
    const searchedButNoSources = (grounding?.queries?.length ?? 0) > 0 && (grounding?.chunks?.length ?? 0) === 0;
    if (wantSearch && ((grounding?.queries?.length ?? 0) === 0 || (searchedButNoSources && !researchFailed))) {
      console.warn(`[generateEssay] stageA가 ${searchedButNoSources ? "검색은 했지만 출처 인용이 하나도 없음" : "검색 도구를 한 번도 호출하지 않음"} — 강하게 재지시하여 1회 재시도`);
      const forcedPrompt =
        prompt +
        `\n\n【다시 한번 강조 — 반드시 지킬 것】 ${searchedButNoSources ? "방금 쓴 글에는 검색 결과를 근거로 한 문장에도 출처가 연결되지 않았다. 이번에는 검색 결과의 웹페이지를 근거로 쓰는 사실 문장마다 그 출처가 연결되게 쓸 것." : "방금 검색 도구를 한 번도 호출하지 않고 글을 쓰려 했다."} ` +
        `책 제목·저자·인용구·통계 등 검색으로 검증해야 할 구체적 사실이 하나라도 있다면, 이번에는 ` +
        `반드시 실시간 웹 검색 도구를 최소 한 번 이상 실제로 호출한 뒤에 쓸 것.`;
      const retryStageA = await runStageA(forcedPrompt);
      const retryGrounding = retryStageA.grounding;
      if ((retryGrounding?.chunks?.length ?? 0) > 0 || (!searchedButNoSources && (retryGrounding?.queries?.length ?? 0) > 0)) {
        stageA = retryStageA;
        grounding = retryGrounding;
      } else {
        console.warn("[generateEssay] 재지시에도 검색 도구를 호출하지 않음 — 원래 응답으로 그대로 진행");
      }
    }

    const freeText = stageA.text;
    if (!freeText) throw new Error("AI가 빈 응답을 반환했습니다.");

    console.log(
      `[generateEssay] 그라운딩 진단: queries=${JSON.stringify(grounding?.queries ?? [])} ` +
        `groundingChunks=${grounding?.chunks?.length ?? 0} groundingSupports=${grounding?.supports?.length ?? 0} ` +
        `model=${stageA.provider}/${stageA.model}`
    );
    // 왜 특정 출처가 채택됐는지(예: 서지정보 갖춘 페이지 대신 유튜브만 채택되는
    // 문제) 사후에 진단할 수 있도록, 실제로 돌아온 검색 결과 후보 전체를 로그로
    // 남긴다 — groundingChunks는 모델이 "실제로 인용에 쓴" 후보만 담겨 있어서
    // (그 이전 단계의 원본 검색 결과 후보 목록은 API가 노출하지 않음) 이 목록이
    // 우리가 관찰할 수 있는 전부다.
    console.log(
      `[generateEssay] 검색 후보 청크 목록: ${JSON.stringify(
        (grounding?.chunks ?? []).map((c, i) => ({ i, title: c.web?.title, url: c.web?.uri }))
      )}`
    );
    const { sources, chunkIndexToN } = buildSourceList(grounding?.chunks);
    annotated = insertCitationMarkers(freeText, grounding?.supports, chunkIndexToN);
    // 링크 확인(HTTP)과 단계 분리(stage B)는 서로 입력이 겹치지 않아 동시에 돌린다(각주 정리는 둘 다 끝난 뒤 적용).
    const validatePromise = validateSources(sources);
    preAnnotated = annotated;

    // 2차: 본문은 그대로 두고, "## 라벨" 제목을 기준으로 단계별 본문만 분리한다
    // (그라운딩 없이, 순수 추출 작업 — generate-plan.ts와 같은 이유).
    // 본문은 코드가 원문에서 직접 자른다(아래 mechanicalSections). 모든 단계를 자를 수 있으면 모델에게는 메타데이터만 뽑게 하고,
    // 못 자르는 단계가 있을 때만 예전처럼 본문 재현(content)까지 요청한다.
    const needContentFallback = labels.some((l) => !splitAnnotatedIntoSections(preAnnotated, labels).has(l));
    const skipStageB = !isBook && !needContentFallback;
    // 단계 분리 모델 호출은 책 과제(책 정보 추출)이거나 코드가 단계를 못 자를 때만 한다 — 요약 3줄은 글 맨 앞에서 코드가 뽑는다(실측 4~8초 절감).
    const stageBPromise = skipStageB ? Promise.resolve(null) : generate({
        label: "generateEssay:stepB",
        role: "lite",
        prompt: (needContentFallback
          ? `
  아래 글은 여러 단계로 구성된 하나의 수행평가 원고다. 글 맨 앞에 전체 내용을
  요약한 불릿 3줄이 있으면 그걸 summary_lines 배열로 뽑아줘(스키마 설명 참고).
  이 글이 인물/사건 등을 자유롭게 선정해서 다룬 것이면 confirmed_subject에도
  그 대상 이름을 뽑아줘(스키마 설명 참고).
  그다음 "## 단계이름" 제목을 기준으로 각 단계 본문을 분리해줘. 제목 줄 자체는
  빼고, 본문(각주 표기 [1][2] 등과 "[자료부족...]" 표기 포함)은 다듬지 말고
  그대로 옮겨줘. 분리해야 할 단계 이름: ${labels.join(", ")}.
  각 단계에 책을 언급/추천한 내용이 있으면 cited_book_title/cited_book_author/
  cited_book_quote 필드에도 그대로 뽑아줘(스키마 설명 참고) — 책 제목이 겹낫표
  (《》/『』)로 감싸여 있든 아무 부호 없이 "책 제목: ~"처럼 쓰여 있든 상관없이
  찾아낼 것.
  `
          : `
  아래 글은 여러 단계로 구성된 하나의 수행평가 원고다. 글 맨 앞에 전체 내용을
  요약한 불릿 3줄이 있으면 그걸 summary_lines 배열로 뽑아줘(스키마 설명 참고).
  이 글이 인물/사건 등을 자유롭게 선정해서 다룬 것이면 confirmed_subject에도
  그 대상 이름을 뽑아줘(스키마 설명 참고).
  sections에는 각 단계 이름(label)만 적고 본문은 옮겨 적지 마라 — 본문은 프로그램이 따로 처리한다.
  각 단계 이름: ${labels.join(", ")}.
  각 단계에 책을 언급/추천한 내용이 있으면 cited_book_title/cited_book_author/
  cited_book_quote 필드에 뽑아줘(스키마 설명 참고) — 책 제목이 겹낫표
  (《》/『』)로 감싸여 있든 아무 부호 없이 "책 제목: ~"처럼 쓰여 있든 상관없이
  찾아낼 것.
  `) +
          `
  [글]
  ${preAnnotated}`.trim(),
        schema: needContentFallback ? SECTIONS_SCHEMA : SECTIONS_META_SCHEMA,
      });
    [validatedSources, stageB] = await Promise.all([validatePromise, stageBPromise]);
  }
  if (validatedSources.length > 0 && validatedSources.every((s) => s.url_valid === false)) {
    console.warn("[generateEssay] 검색은 됐지만 모든 출처 링크 검증(HTTP 상태 확인)이 실패함");
  }

  // 라에네크 결과물 감사(2026-09-16)에서 실제로 발견된 문제: 출처 6개 중 1개가
  // (제목은 "newsmp.com"인데 실제 도착 URL은 se-cu.com/ndsoft/error.html —
  // 죽은 도메인이 돌려주는 안내 페이지) 검증에 실패했는데도, 그 출처를 가리키는
  // [4] 각주는 본문에 그대로 남아 학생에게 "검증된 참고문헌"처럼 보였다.
  // validateSources()가 개별 출처마다 url_valid를 매기지만, 지금까지는 "전체
  // 출처가 0개"인 극단적 경우에만 각주를 통째로 지웠을 뿐 "일부만 무효"인
  // 훨씬 흔한 경우는 그대로 방치돼 있었다 — 검증 실패로 확인된 출처 번호만
  // 콕 집어 각주 표시를 지운다(문장 내용은 그대로 보존, 표시만 제거).
  // 링크 검증 실패뿐 아니라 "블로그·개인" 등급(source-quality.ts) 출처도 핵심 사실의 근거로 쓰지
  // 않는다 — 열리는 것과 근거로 쓸 만한 것은 다르다(각주 표시만 제거, 문장은 보존).
  const invalidNs = new Set(
    validatedSources.filter((s) => s.url_valid === false || s.tier === "weak").map((s) => s.n)
  );
  if (invalidNs.size > 0) {
    console.warn(`[generateEssay] 검증 실패한 출처를 가리키는 각주 제거: [${[...invalidNs].join(",")}]`);
    annotated = stripInvalidCitationMarkers(annotated, invalidNs);
  }

  const mechanicalSections = splitAnnotatedIntoSections(annotated, labels);

  type StageBParsed = {
    summary_lines?: string[];
    confirmed_subject?: string;
    sections: { label: string; content?: string; cited_book_title?: string; cited_book_author?: string; cited_book_quote?: string }[];
  };
  let parsed: StageBParsed;
  if (stageB) {
    const raw = stageB.text;
    if (!raw) throw new Error("단계 분리 응답이 비어 있습니다.");
    parsed = JSON.parse(raw) as StageBParsed;
  } else {
    // 모델 호출 없이: 요약은 맨 앞 불릿 줄, 확정 대상은 이미 정해진 값(없으면 빈 문자열), 단계 본문은 코드가 자른 것을 쓴다.
    // 책 경로의 확정 대상은 조사가 확인한 책(예전 경로가 등장인물 이름을 넣던 자리 — 플랜 생성의 고정 대상으로 그대로 쓰인다).
    parsed = { summary_lines: extractSummaryLines(preAnnotated), confirmed_subject: notes?.book?.title ?? input.presetSubject?.name ?? "", sections: [] };
  }
  // stage B는 링크 확인과 동시에 돌아서 무효 출처 각주가 아직 남은 글을 봤다 — 요약·폴백 본문에서도 같은 각주를 지운다.
  if (invalidNs.size > 0) {
    parsed.summary_lines = (parsed.summary_lines ?? []).map((l) => stripInvalidCitationMarkers(l, invalidNs));
    for (const sec of parsed.sections) if (sec.content) sec.content = stripInvalidCitationMarkers(sec.content, invalidNs);
  }

  // 안전장치: 실제로 그라운딩이 안 됐는데(출처 0개) 본문에 [1][2] 같은 각주 모양이
  // 남아있으면 근거 없는 각주이므로 지운다.
  const stripCitations = validatedSources.length === 0;

  // 본문은 stage B의 재현이 아니라 annotated(각주까지 이미 정확한 텍스트)에서
  // "## 라벨" 제목줄 기준으로 코드가 직접 잘라낸 걸 우선 쓴다 — 위
  // splitAnnotatedIntoSections() 설명 참고. 라벨 목록도 stage B가 돌려준
  // parsed.sections(순서·개수가 어긋날 수 있음)가 아니라 원래 요청한 labels를
  // 기준으로 순회해서, 어떤 단계의 메타데이터(cited_book_*)가 누락되거나
  // 순서가 달라도 본문 매칭 자체는 흔들리지 않게 한다.
  const metaByLabel = new Map(parsed.sections.map((s) => [s.label, s]));

  const insufficientReasons: string[] = [];
  const sections: RawSection[] = labels.map((label) => {
    const meta = metaByLabel.get(label);
    const rawContent = mechanicalSections.get(label) ?? meta?.content ?? "";
    if (!mechanicalSections.has(label)) {
      console.warn(`[generateEssay] label="${label}" 본문을 원문에서 못 잘라내서 stage B의 content로 폴백함`);
    }
    let content = stripCitations ? tidyOutputText(rawContent.replace(/\[\d+\]/g, "")) : rawContent;
    const insufficientMatch = content.trimStart().match(/^\[자료부족:?\s*(.*?)\]/);
    if (insufficientMatch) {
      insufficientReasons.push(`${label}: ${insufficientMatch[1] || "정보 부족"}`);
    } else {
      const cleaned = cleanStrayBrackets(content);
      if (cleaned !== content) {
        console.warn(`[generateEssay] 이상한 대괄호 정리함 label="${label}"`);
        content = cleaned;
      }
    }
    let citedBook = meta?.cited_book_title
      ? { title: meta.cited_book_title, author: meta.cited_book_author || undefined, quote: meta.cited_book_quote || undefined }
      : undefined;
    // 단계 분리 모델을 안 부르는 책 경로: 책은 조사가 확인한 하나이므로, 본문에 그 제목이 나오면 그 책을 언급한 단계로 본다.
    if (!citedBook && notes?.book) {
      const key = (t: string) => t.replace(/[\s『』《》「」"']/g, "").toLowerCase();
      const shortTitle = key(notes.book.title.split(/[:(（]/)[0]);
      if (shortTitle.length >= 2 && key(content).includes(shortTitle)) citedBook = { title: notes.book.title, author: notes.book.author, quote: undefined };
    }
    const element = elements.find((e) => e.label === label);
    const requiredItems = element && isStructuredElement(element) ? element.required_items : undefined;
    const flowingItems = element && !requiredItems && element.items_format === "flowing" && (element.required_items?.length ?? 0) >= 2 ? element.required_items : undefined;
    return { label, content, citedBook, requiredItems, flowingItems };
  });

  console.log(`[generateEssay] 각주 추적: 생성직후=${countMarkers(sections)} 출처=${validatedSources.length}`);
  return {
    sections,
    sources: validatedSources,
    insufficientReasons,
    summaryLines: parsed.summary_lines ?? [],
    confirmedSubject: parsed.confirmed_subject ?? "",
    notes: useResearchWrite ? notes : undefined,
  };
}

const SOURCE_JUDGE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.INTEGER },
          source: { type: Type.INTEGER, description: "문장의 핵심 주장이 본문에 실제로 있는 출처 번호. 없거나 확실치 않으면 0" },
        },
        required: ["id", "source"],
      },
    },
  },
  required: ["results"],
};

/**
 * 출처를 줄이려고 고른 몇 개의 출처 페이지가, 원래 다른 출처가 달려 있던 문장도 뒷받침하는지 작은 모델이 한 번에 확인한다(출처 대조 — 연도·수치로 확인할 수 없는 서술 문장용).
 * 확실하지 않으면 0으로 답하게 해서 원래 출처를 그대로 둔다. 실패하면 빈 결과(= 아무것도 옮기지 않음).
 */
async function judgeSourceSupport(
  items: { key: string; text: string }[],
  chosen: number[],
  pageTexts: PageTexts
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const pages = chosen.filter((n) => typeof pageTexts.get(n) === "string" && (pageTexts.get(n) as string).length > 200);
  if (items.length === 0 || pages.length === 0) return out;
  try {
    const res = await generate({
      label: "generateEssay:sourceJudge",
      role: "lite",
      effort: "minimal",
      prompt:
        "아래 [문장]들이 각각 [출처 본문] 중 어느 출처의 내용으로 뒷받침되는지 판정해줘. 문장의 핵심 주장(누가·무엇을·언제·왜)이 그 출처 본문에 실제로 있어야 한다. " +
        "비슷한 주제일 뿐이거나 확실하지 않으면 source를 0으로 답할 것(후하게 판정하지 말 것). 출처 본문은 영어일 수 있다.\n\n" +
        pages.map((n) => `[출처 ${n} 본문]\n${(pageTexts.get(n) as string).slice(0, 6000)}`).join("\n\n") +
        "\n\n" +
        items.map((it, i) => `[문장 ${i}] ${it.text}`).join("\n"),
      schema: SOURCE_JUDGE_SCHEMA,
    });
    const parsed = JSON.parse(res.text ?? "{}") as { results?: { id: number; source: number }[] };
    for (const r of parsed.results ?? []) {
      const it = items[r.id];
      if (it && pages.includes(r.source)) out.set(it.key, r.source);
    }
  } catch (err) {
    console.warn("[generateEssay] 출처 판정 실패(원래 출처 유지)", err);
  }
  return out;
}

const COVERAGE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          missing: { type: Type.ARRAY, items: { type: Type.STRING }, description: "글이 실질적으로 다루지 않은 항목(항목 이름 그대로). 다 다뤘으면 빈 배열." },
        },
        required: ["label", "missing"],
      },
    },
  },
  required: ["results"],
};

/**
 * flowing 단계의 필수 항목 중 키워드로 안 보이는 것(coverage.ts의 1차 검사)만 작은 모델에게 한 번 확인시킨다 — 표현이 달라서 생긴 거짓 경보로
 * 비싼 재생성을 돌리지 않기 위해서다. 후보가 없으면 모델을 부르지 않는다. 판정이 실패하면 "누락 없음"으로 본다(근거 없는 재생성을 막는다).
 */
async function confirmCoverageGaps(sections: RawSection[]): Promise<CoverageGap[]> {
  const suspects = findUncoveredFlowingItems(sections.map((s) => ({ label: s.label, content: s.content, requiredItems: s.flowingItems })));
  if (suspects.length === 0) return [];
  try {
    const body = suspects
      .map((g) => {
        const sec = sections.find((s) => s.label === g.label)!;
        return `## ${g.label}\n[확인할 항목] ${g.missing.join(" / ")}\n[글]\n${sec.content}`;
      })
      .join("\n\n");
    const res = await generate({
      label: "generateEssay:coverage",
      role: "lite",
      prompt:
        "아래 각 글이 [확인할 항목]을 실질적으로 다루는지 판정해줘. 표현이 달라도 그 내용을 글이 분명히 다루면 다룬 것으로 본다. " +
        "한 줄 언급도 없거나 제목만 있고 내용이 비어 있으면 누락이다. 누락된 항목만 missing에 항목 이름 그대로 적어줘.\n\n" +
        body,
      schema: COVERAGE_SCHEMA,
    });
    const parsed = JSON.parse(res.text ?? "{}") as { results?: { label: string; missing: string[] }[] };
    const gaps: CoverageGap[] = [];
    for (const g of suspects) {
      const judged = parsed.results?.find((r) => r.label === g.label);
      const confirmed = g.missing.filter((m) => judged?.missing?.some((x) => x.includes(m) || m.includes(x)));
      if (confirmed.length > 0) gaps.push({ label: g.label, missing: confirmed });
    }
    return gaps;
  } catch (err) {
    console.warn("[generateEssay] 항목 포함 여부 판정 실패(누락 없음으로 처리)", err);
    return [];
  }
}

export async function generateEssay(
  input: GenerateEssayInput
): Promise<EssayResult | InsufficientDataResult> {
  const start = Date.now();
  // 30초를 넘기면 학생이 "그냥 ChatGPT가 낫다"고 느낀다 — 필수 경로(조사·글쓰기)는 끝까지 하되,
  // 품질 교정용 추가 모델 호출(재생성·부분 보완·분량 보정·형식 보완·한국어 재작성·항목 재판정)은 예산을 넘기면 건너뛴다.
  // 건너뛴 것은 로그와 화면 경고로 남는다. ESSAY_TIME_BUDGET_MS=0이면 예전처럼 전부 실행.
  const timeBudgetMs = process.env.ESSAY_TIME_BUDGET_MS === undefined ? 22000 : Number(process.env.ESSAY_TIME_BUDGET_MS);
  // 안내문이 요구한 것을 채우는 보완(필수 항목·표·형식 조건·날조 문장 수정)은 예산을 조금 넘겨도 한 번은 한다 — 요구사항 미충족이 더 큰 손해다.
  const overBudget = (what: string, kind: "optional" | "required" = "optional"): boolean => {
    if (!timeBudgetMs) return false;
    const limit = kind === "required" ? timeBudgetMs + 4000 : timeBudgetMs;
    const spent = Date.now() - start;
    if (spent <= limit) return false;
    console.warn(`[generateEssay] 시간 예산 초과(${(spent / 1000).toFixed(1)}초) — ${what} 건너뜀`);
    return true;
  };
  // 영어로 쓸 때는 안내문의 글자 수 기준(한국어)을 영어 글자 수로 늘린다 — 그대로 두면 분량 보정이 영어 글을 절반 이하로 잘라 낸다.
  if (currentOutputLang() === "en") input = { ...input, coreTaskInfo: scaleLengthsForEnglish(input.coreTaskInfo) };
  // 안내문의 개수 조건: "8장면" 같은 단위는 필수 항목("장면 1…8")으로 펼친다(생성 시점에만 — 저장된 분석 결과·화면은 그대로).
  const formOn = formRequirementsOn();
  if (formOn) input = { ...input, coreTaskInfo: applyFormRequirements(input.coreTaskInfo) };
  // 신문처럼 "실제로 제출할 산출물" 단계는 조사 자료 형식("### 항목명" 불릿 나열)이 아니라 그 산출물의 형식으로 쓴다 —
  // 분석 단계가 안내문 문장을 required_items로 베껴 sections로 분류해도 여기서 바로잡는다(deliverable.ts).
  const fixes = qualityFixesOn();
  const sourceListItems: { label: string; item: string }[] = [];
  const elements = input.coreTaskInfo.task_elements
    .filter((e) => e.type === "text_submission")
    .map((e) => (e.items_format === "sections" && (inferDeliverableForm(e) || isProseForm(e)) ? { ...e, items_format: "flowing" as const } : e))
    .map((e) => {
      // "신뢰할 수 있는 출처 3개 이상" 같은 출처 목록 항목은 모델이 쓰지 않고, 마지막에 확인된 출처로 코드가 채운다(아래 sourceListItems).
      if (!fixes || !e.required_items?.some(isSourceListItem)) return e;
      for (const item of e.required_items.filter(isSourceListItem)) sourceListItems.push({ label: e.label, item });
      return { ...e, required_items: e.required_items.filter((i) => !isSourceListItem(i)) };
    })
    .map((e) => {
      // 하한만 있고 예시 답안 분량이 적혀 있으면(예: "120단어 이상", 예시 136단어) 예시의 1.4배를 상한으로 둔다 — 넘으면 기존 분량 보정이 줄인다.
      // 실측(2026-10-24, n=3): 지시만으로는 243~365단어가 나왔다. EXAMPLE_LENGTH_CAP=off로 끈다.
      const t = e.target_length;
      if (!fixes || process.env.EXAMPLE_LENGTH_CAP === "off" || !t || !(t.min > 0) || t.max > 0) return e;
      const ex = exampleLength(input.coreTaskInfo.writing_guide, t.unit);
      return ex && ex >= t.min ? { ...e, target_length: { ...t, max: Math.round(ex * 1.4) } } : e;
    });
  if (sourceListItems.length > 0) input = { ...input, sourceListItems };

  // 3단계: 후보 생성 ↔ 검증 분리. F6 재생성(previousOutputText 있음)은
  // 이전 버전에서 이미 책이 확정돼 있으므로 다시 고르지 않는다(안 그러면
  // "이미 정해진 사실은 바꾸지 말라"는 지시와 충돌할 수 있음). presetBook을
  // input에 얹어서 이 아래 모든 generateOnce() 호출(초회+재시도)에 자연스럽게
  // 전달되게 한다.
  if (!input.previousOutputText) {
    const studentSpecifiedBook = extractStudentSpecifiedBook(input.instructions);
    if (studentSpecifiedBook) {
      console.log(`[generateEssay] 학생이 지침에 직접 지정한 책으로 고정: "${studentSpecifiedBook.title}"`);
      input = { ...input, presetBook: studentSpecifiedBook };
    } else if (needsBookCandidateSelection(input, elements)) {
      // 구절을 요구하지 않는 책 과제는 후보를 검색 없이 제안받고(수 초), 실존·서지는 이어지는 조사 단계가 확인한다. 못 고르면 기존 검색 기반 선정(15~30초)으로.
      // 빠른 제안이 가끔 빈 후보를 돌려준다(실측 2026-10-23, 같은 입력 재호출은 정상) — 검색 기반 선정(약 25초)보다 한 번 더 묻는 쪽(약 6초)이 싸다.
      const tryFast = (!taskNeedsExcerpt(input, elements) || preExcerptOn()) && process.env.ESSAY_BOOK_PIPELINE !== "legacy";
      const fast = tryFast ? ((await selectBookCandidateFast(input)) ?? (await selectBookCandidateFast(input))) : null;
      const presetBook = fast ?? (await selectBookCandidate(input));
      if (presetBook) input = { ...input, presetBook };
    }
  }

  // 자동 선정(인물·사건·탐구 대상·발표 주제 등). 책 과제는 위 책 선정이 맡으므로 건너뛴다. 선정 결과는 이후 생성에서 바꾸지 않는다.
  let subjectSelection: SelectedSubject | null = null;
  if (!input.previousOutputText && !input.presetBook && !input.presetSubject && input.selection) {
    try {
      subjectSelection = await selectSubjectForTask(
        { subject: input.subject, info: input.coreTaskInfo, instructions: input.instructions },
        input.selection
      );
    } catch (err) {
      console.error("[generateEssay] 자동 선정 실패(본문 생성이 직접 고르도록 폴백)", err);
    }
    if (subjectSelection) {
      input = {
        ...input,
        presetSubject: {
          name: subjectSelection.name,
          key: subjectSelection.key,
          group: subjectSelection.group,
          userSpecified: subjectSelection.kind === "user_specified",
          tier: subjectSelection.tier,
          fallbackUsed: subjectSelection.fallbackUsed,
        },
      };
    }
  }

  // 책 과제의 저자 확인(검색, 약 10초)은 글을 다 쓴 뒤 하던 것을 조사·글쓰기와 동시에 미리 시작한다. 서지가 페이지 본문으로 확인되면 결과를 쓰지 않는다.
  const presetForAuthor = input.presetBook?.author && !input.previousOutputText && process.env.ESSAY_AUTHOR_PRECHECK !== "off" ? input.presetBook : null;
  const authorPrecheck = presetForAuthor
    ? verifyAuthorAttribution(presetForAuthor.title, presetForAuthor.author!).catch((err) => {
        console.error("[generateEssay] 저자 미리 확인 실패(글 뒤 확인으로)", err);
        return null;
      })
    : null;

  let attempt: Attempt;
  try {
    attempt = await generateOnce(input, elements);
  } catch (err) {
    console.error("[generateEssay] 1차 시도 실패", err);
    return {
      type: "insufficient_data",
      reason: "지금 검색 서비스가 불안정해서 원고를 만들지 못했어요. 잠시 후 다시 시도해주세요.",
    };
  }

  // "자료부족"을 자체 보고했으면(진짜로 필요한 제3자 정보가 지침에 아예 없는
  // 경우), 조용히 넘어가지 않고 한 번 재시도한다 — 그래도 남으면 실패로 처리한다.
  // (대괄호를 이상하게 쓰는 것 자체는 실패 사유가 아니다 — cleanStrayBrackets()가
  // 이미 정리했다. 매번 통째로 실패시키면 사용자가 "생성 실패"를 너무 자주 보게
  // 된다는 게 실제 테스트로 확인됐다.)
  // 이 과제의 조사 노트(또는 조사 실패 표시)를 이후 재시도가 그대로 쓴다 — 다시 조사하면 약 15초가 더 든다.
  if (attempt.notes !== undefined) input = { ...input, researchNotes: attempt.notes };
  // 조사가 책의 제목·저자를 정정했으면 이후 검사·재시도도 그 책을 기준으로 한다.
  if (attempt.notes?.book) input = { ...input, presetBook: attempt.notes.book };

  if (attempt.insufficientReasons.length > 0) {
    console.warn(`[generateEssay] 자료부족 감지, 1회 재시도: ${JSON.stringify(attempt.insufficientReasons)}`);
    try {
      attempt = await generateOnce(input, elements);
    } catch (err) {
      console.error("[generateEssay] 재시도 실패", err);
    }
  }

  if (attempt.insufficientReasons.length > 0) {
    console.error(`[generateEssay] 재시도 후에도 자료부족: ${JSON.stringify(attempt.insufficientReasons)}`);
    return {
      type: "insufficient_data",
      reason: `다음 정보가 부족해서 완성하지 못했어요 — ${attempt.insufficientReasons.join(" / ")}. "이번 과제 한정 지침"에 필요한 내용을 추가로 적고 다시 시도해주세요.`,
    };
  }

  // 기계적으로 검사해서, 걸리면 그 문제를 콕 집어 재지시하며 한 번 더 시도한다
  // (findFactMismatches 재시도 패턴과 동일) — 각각 프롬프트 지시만으로는 실제로
  // 안 지켜지는 게 반복 테스트로 확인됐다:
  // 1) ANTI_AI_TONE_RULES가 "너는 충분히 ~야" 등을 이름까지 짚어 금지하는데도
  //    상투적 위로/결어가 그대로 나오는 경우.
  // 2) "인상 깊은 구절"을 인용하면서 그 문장에는 정작 [n] 각주가 없거나, 각주가
  //    있어도 그게 전부 동영상 플랫폼 출처인 경우(원문 대조 불가능이라 마찬가지로
  //    미검증으로 취급).
  // 3) 책 제목(《...》)을 언급한 섹션인데 그 섹션 전체에 각주가 하나도 없는 경우
  //    (여러 사실을 한 번의 포괄적 검색으로 뭉뚱그려서 각주가 엉뚱한 문장에
  //    붙어버리고 정작 책 언급 문장은 각주 없이 남는 경우가 실제로 있었다).
  // 4) 책 제목을 언급한 섹션인데 인용된 출처가 전부 동영상 플랫폼뿐인 경우
  //    (서지정보 갖춘 텍스트 페이지가 검색 후보에 있었을 수 있는데도 유튜브만
  //    단독 채택된 경우 — 실제 리포트된 버그).
  const cliches = detectCliches(attempt.sections);
  const unsupportedSuperlatives = detectUnsupportedSuperlatives(attempt.sections);
  const languageMismatches = detectLanguageMismatches(attempt.sections, elements, input.subject);
  const presetBookMismatch = detectPresetBookMismatch(attempt.sections, input.presetBook);
  const presetSubjectMismatch = detectPresetSubjectMismatch(attempt, input.presetSubject);
  // 실제로 발견된 버그: 요약 문장에 아랍 문자가 섞여 나온 사례("ف친구가
  // 겪는...") — 본문/요약 둘 다 확인한다(요약은 사고가 실제로 일어난 곳).
  const corruptedSections = [
    ...detectForeignScriptCorruption(attempt.sections),
    ...(attempt.summaryLines.some((l) => hasForeignScriptCorruption(l)) ? ["전체 요약"] : []),
  ];
  if (corruptedSections.length > 0) {
    // 진단용: 어떤 문자가 이상 문자로 판정됐는지(코드포인트만 — 본문은 남기지 않는다)
    const cps = new Set<string>();
    for (const t of [...attempt.sections.map((x) => x.content), ...attempt.summaryLines]) for (const ch of findForeignScriptChars(t)) cps.add("U+" + ch.codePointAt(0)!.toString(16));
    console.warn(`[generateEssay] 이상 문자 판정 코드포인트: ${[...cps].slice(0, 12).join(",")}`);
  }
  // 책 과제가 아니면(인물 탐구 중 지나가며 책을 언급) 책 각주 재검증을 강제하지 않는다 — 재시도가 책 서지·인상 깊은 구절 블록을 글에 끼워 넣는 부작용이 실측됐다.
  const isBookTask = !!input.presetBook || needsBookCandidateSelection(input, elements);
  const uncitedBookMentions = isBookTask ? detectUncitedBookMentions(attempt.sections) : [];
  // unverifiedQuotes/soleVideoSourceBooks는 더 이상 여기서 직접 교정 지시를
  // 만드는 데 안 쓴다 — 둘 다 "이 섹션엔 검증된 직접 인용이 없다"는 신호의
  // 부분집합이라, 아래 bookMentionsNeedingVerification이 이미 포괄한다.
  // 측정/로그용으로만 남겨둔다(재검색 성공률을 이전 라운드와 비교하기 위함).
  const unverifiedQuotes = detectUnverifiedQuotes(attempt.sections, attempt.sources, input.instructions);
  const soleVideoSourceBooks = detectSoleVideoSourceBookMentions(attempt.sections, attempt.sources);
  // 책 과제가 아닌데(인물 탐구 등) 지나가며 책 제목만 언급한 경우는 원문 검증·인용구 승급 검색(약 60초·검색 6회, 실측)을 돌리지 않는다. 직접 인용구가 있으면 그때는 검증한다.
  // 안내문이 원문 구절을 요구하지 않으면(예: 한 줄 서평) 인용구 검색·검증(실측 60~100초)을 돌리지 않는다.
  const excerptRequired = needsExcerpt([input.coreTaskInfo.topic, ...input.coreTaskInfo.requirements, ...elements.flatMap((e) => [e.label, e.description]), input.instructions ?? ""]);
  // 구절을 조사와 동시에 미리 확인했으면(성공·실패 모두) 글을 쓴 뒤 다시 확인·재작성하지 않는다 — 아래 applyCanonicalQuotes가 결과를 적용한다.
  const preExcerpt = input.researchNotes?.excerpt;
  const bookMentionsNeedingVerification = excerptRequired && !preExcerpt
    ? extractBookMentionsNeedingVerification(attempt.sections, attempt.sources, !isBookTask).filter((b) => isBookTask || !!b.candidateQuote)
    : [];
  const lengthIssues = checkLengthCompliance(attempt.sections, elements);
  for (const el of elements) {
    const t = el.target_length;
    const sec = t && attempt.sections.find((x) => x.label === el.label);
    if (t && sec) console.log(`[generateEssay] 분량 첫 글: label="${el.label}" 실제=${t.unit === "words" ? countWords(sec.content) : countChars(sec.content, t.counts_spaces)} 범위=${t.min}~${t.max}`);
  }
  // 안내문의 필수 항목이 "### 항목명" 소제목으로 존재하고 내용이 있는지 기계적으로
  // 검사한다(analyze.ts가 안내문에서 동적으로 뽑은 required_items 기준).
  const missingItems = detectMissingRequiredItems(attempt.sections);
  if (missingItems.length > 0) {
    console.warn(`[generateEssay] 필수 항목 누락 감지: ${JSON.stringify(missingItems)}`);
  }
  // 소제목 없이 쓰는 단계(신문·편지 등)의 필수 항목 누락과, 단계·항목 사이에 거의 같은 문장이 되풀이되는지도 본다.
  const flowingGaps = overBudget("소제목 없는 단계의 항목 확인") ? [] : await confirmCoverageGaps(attempt.sections);
  if (flowingGaps.length > 0) console.warn(`[generateEssay] 필수 항목 누락 감지(소제목 없는 단계): ${JSON.stringify(flowingGaps)}`);
  // 영어 글쓰기의 필수 어법(수동태·It~that 강조·관계대명사)이 빠졌으면 그 단계만 부분 보완한다(english-grammar.ts — 코드로 판정).
  const grammarGaps: CoverageGap[] = [];
  if (fixes) {
    const reqText = [...input.coreTaskInfo.requirements, input.coreTaskInfo.writing_guide ?? ""].join(" ");
    for (const el of elements) {
      if (!detectElementLanguage(input.subject, el)?.startsWith("English")) continue;
      const sec = attempt.sections.find((s) => s.label === el.label);
      const forms = requiredGrammarForms(`${reqText} ${el.description} ${(el.required_items ?? []).join(" ")}`);
      const miss = sec ? missingGrammarForms(sec.content, forms) : [];
      // 실측(2026-10-24, 4회 중 3회): 영어 본문에 선정 대상의 한글 이름이 섞였다("The product is the 휴대용 태양열 조리기") — 소제목 줄은 빼고 본다.
      const hangulInBody = !!sec && /[가-힣]/.test(sec.content.replace(/^#.*$/gm, ""));
      const missing = [...miss.map((f) => GRAMMAR_REPAIR_TEXT[f]), ...(hangulInBody ? ["본문 문장에 섞인 한글(이름 포함)을 모두 자연스러운 영어로 바꿀 것 — 소제목 줄은 그대로 둘 것"] : [])];
      if (missing.length > 0) grammarGaps.push({ label: el.label, missing });
    }
    if (grammarGaps.length > 0) console.warn(`[generateEssay] 필수 어법 누락 감지: ${JSON.stringify(grammarGaps.map((g) => g.label))}`);
  }
  // 학생이 하지 않은 행동을 "했다"고 쓴 문장(사진 촬영·스크랩·부착 등) — 제출하면 거짓 기록이라 그 단계만 다시 쓰게 한다(own-activity.ts).
  const activityRewrites: { label: string; instruction: string }[] = [];
  if (fixes) {
    for (const sec of attempt.sections) {
      const hits = findOwnActivitySentences(sec.content);
      if (hits.length > 0) activityRewrites.push({ label: sec.label, instruction: ownActivityRepairText(hits) });
    }
    if (activityRewrites.length > 0) {
      console.warn(`[generateEssay] 하지 않은 활동을 썼다고 한 문장 감지: ${JSON.stringify(activityRewrites.map((r) => r.label))}`);
    }
  }
  // 직접 수행 기록 단계의 빈칸이 너무 많으면(본인만 아는 것 외에도 비워 둠) 그 단계만 다시 쓰게 한다 — 학생이 받는 내용이 없어진다.
  const MAX_BLANKS = Number(process.env.ESSAY_MAX_BLANKS) || 3;
  if (fixes) {
    for (const el of elements) {
      if (!isOwnRecordStep(el)) continue;
      const sec = attempt.sections.find((s) => s.label === el.label);
      const found = sec ? countBlanks(sec.content) : 0;
      if (found <= MAX_BLANKS) continue;
      console.warn(`[generateEssay] 직접 작성 빈칸이 ${found}개 label="${el.label}" — 본인만 아는 것만 남기고 채우게 함`);
      activityRewrites.push({ label: el.label, instruction: blankOveruseRepairText(MAX_BLANKS, found) });
    }
  }

  // 각주 없이 남은 수치 문장: 노트에 있는 값이면 코드가 번호를 붙이고, 노트에 없는 값이면 그 단계만 다시 쓰게 한다(uncited-figures.ts).
  if (fixes && attempt.notes) {
    const factTexts = attempt.notes.facts.map((f) => f.fact);
    const recovered = attempt.sections.map((s) => {
      const found = findUncitedFigures(s.content, factTexts);
      if (found.length === 0) return s;
      // 노트에 있는 값인데 번호만 빠진 문장은 사실 번호를 붙였다가 바로 출처 번호로 바꾼다(모델 호출 없음).
      const recoverable = found.filter((f) => f.inNotes);
      if (recoverable.length === 0) return s;
      const marked = attachFactMarkers(s.content, attempt.notes!.facts);
      if (marked.attached === 0) return s;
      const mapped = mapFactMarkers(marked.text, attempt.notes!.facts);
      // 이 단계에서만 쓰는 번호가 새로 생기면 전체 출처 목록과 어긋난다 — 이미 있는 번호로만 바뀐 경우에만 받는다.
      const known = new Set(attempt.sources.map((x) => x.n));
      const ns = [...mapped.text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
      if (ns.some((n) => !known.has(n))) return s;
      console.log(`[generateEssay] 각주 없던 수치 문장 ${marked.attached}개에 출처를 붙임 label="${s.label}"`);
      return { ...s, content: mapped.text };
    });
    attempt = { ...attempt, sections: recovered };
    for (const s of attempt.sections) {
      const left = findUncitedFigures(s.content, factTexts).filter((f) => !f.inNotes);
      if (left.length === 0) continue;
      console.warn(`[generateEssay] 조사 자료에 없는 수치 ${left.length}개 label="${s.label}": ${JSON.stringify(left.slice(0, 2).map((x) => x.values))}`);
      activityRewrites.push({ label: s.label, instruction: uncitedFigureRepairText(left) });
    }
  }

  // 안내문이 허용하지 않은 자료(사진·영상 등)를 썼으면 그 단계만 다시 쓰게 한다(data-visual.ts).
  if (fixes) {
    const policy = visualPolicy([...input.coreTaskInfo.requirements, input.coreTaskInfo.writing_guide ?? "", ...elements.map((e) => e.description)]);
    if (policy.banned.length > 0) {
      for (const sec of attempt.sections) {
        const lines = findBannedVisuals(sec.content, policy);
        if (lines.length === 0) continue;
        console.warn(`[generateEssay] 허용되지 않은 자료 언급 label="${sec.label}": ${JSON.stringify(lines.slice(0, 2))}`);
        activityRewrites.push({ label: sec.label, instruction: bannedVisualRepairText(sec.label, lines, policy) });
      }
    }
  }

  // 안내문이 요구한 표·그래프가 글에 실제로 없으면 그 단계만 다시 쓰게 한다(data-visual.ts — 설명·자리 표시로 대신한 경우).
  if (fixes) {
    for (const el of elements) {
      if (!needsDataTable(el, input.coreTaskInfo.requirements, input.coreTaskInfo.writing_guide, elements.length === 1)) continue;
      const sec = attempt.sections.find((s) => s.label === el.label);
      if (!sec || hasDataTable(sec.content)) continue;
      console.warn(`[generateEssay] 표·그래프를 글에 만들지 않음 label="${el.label}"`);
      activityRewrites.push({ label: el.label, instruction: dataTableRepairText(el.label) });
    }
  }
  const repeatedPairs = findRepeatedStatements(attempt.sections.map((s) => ({ label: s.label, content: s.content })));
  // 한두 건은 자연스러운 겹침(핵심 연도 문장 등)일 수 있어 3건 이상일 때만 되풀이로 본다.
  const repetitionIssue = repeatedPairs.length >= 3;
  if (repeatedPairs.length > 0) {
    console.warn(`[generateEssay] 되풀이 문장 ${repeatedPairs.length}쌍 감지${repetitionIssue ? "" : "(허용 범위)"}: ${JSON.stringify(repeatedPairs.slice(0, 4).map(describePair))}`);
  }
  console.log(
    `[generateEssay] 인용구 검증 필요 섹션: ${JSON.stringify(bookMentionsNeedingVerification)} ` +
      `(진단용 — unverifiedQuotes=${JSON.stringify(unverifiedQuotes)} soleVideoSourceBooks=${JSON.stringify(soleVideoSourceBooks)})`
  );
  if (lengthIssues.length > 0) {
    console.log(`[generateEssay] 분량 미준수 감지: ${JSON.stringify(lengthIssues)}`);
  }

  // 실제로 발견된 버그: 인용구 검증(위 bookMentionsNeedingVerification)은
  // "이미 검증된 직접 인용이 있는" 책은 대상에서 빼버리는데, 그 상태에서도
  // 저자명 자체는 틀릴 수 있었다(각주까지 정상 붙은 채로 "김나이"라고 틀리게
  // 표기 — 실제 저자는 전승환). 그래서 저자 대조는 "뭔가 이미 잘못돼 보일
  // 때"만 반응하지 않고, 책이 언급될 때마다 사전에(proactively) 검증한다 —
  // 겉으로는 전혀 문제없어 보이는 게 바로 이 버그의 특징이었기 때문이다.
  // 책 1건만 대상으로 한다(이 과제 유형은 보통 책 1개, latency 예산 고려 —
  // essay 경로와 동일한 이유로 이미 여러 검증이 겹쳐 있다).
  // 책 과제가 아니면(인물 탐구·신문 등에서 지나가며 언급한 책) 저자 표기 차이로 재생성까지 가는 비용(실측 약 100초)이 이득보다 크다.
  const MAX_AUTHOR_CHECKS = isBookTask && !input.researchNotes?.bookVerified ? 1 : 0;
  const quoteVerificationByTitle = new Map<string, VerificationResult>();
  if (preExcerpt && input.presetBook) quoteVerificationByTitle.set(normalizeBookTitleKey(input.presetBook.title), preExcerpt);
  const distinctBooksWithAuthor = extractDistinctBookMentions(attempt.sections).filter((b) => b.author);
  const authorMismatches: { title: string; claimedAuthor: string; confirmedAuthor: string; source?: { title: string; url: string } }[] = [];
  for (const book of distinctBooksWithAuthor.slice(0, MAX_AUTHOR_CHECKS)) {
    const pre =
      authorPrecheck && presetForAuthor && normalizeBookTitleKey(book.title) === normalizeBookTitleKey(presetForAuthor.title) && sameAttribution(book.author!, presetForAuthor.author!)
        ? await authorPrecheck
        : null;
    const result = pre ?? (await verifyAuthorAttribution(book.title, book.author!));
    if (result.status === "confirmed_mismatch" && result.confirmedAttribution) {
      authorMismatches.push({
        title: book.title,
        claimedAuthor: book.author!,
        confirmedAuthor: result.confirmedAttribution,
        source: result.source,
      });
    }
  }
  if (authorMismatches.length > 0) {
    console.warn(`[generateEssay] 저자 불일치 감지: ${JSON.stringify(authorMismatches)}`);
  }

  // 검색·재작성이 필요한 문제만 전체 재시도(검색 포함, 30~100초)로 보낸다. 분량 미달·반복·소제목 없는 단계의 항목 누락은 그 단계만 검색 없이 고친다(아래 repairLocally, 약 5~10초) —
  // 분량은 마지막의 adjustSectionLength가 맡는다(전체 재생성은 오히려 분량이 흔들린다는 실측).
  // 상투구·근거 없는 최상급만으로는 전체를 다시 쓰지 않는다 — 마지막 정리(stripCliches·stripUnsupportedSuperlatives)가 이미 지운다.
  // 실측(2026-10-24, 107회 중 10회 전체 재작성, 8회가 상투구 때문): 모든 단계를 다시 써서 글쓰기 비용이 약 2배. CLICHE_FULL_RETRY=on이면 예전처럼.
  const needsFullRetry =
    ((!fixes || process.env.CLICHE_FULL_RETRY === "on") && (cliches.length > 0 || unsupportedSuperlatives.length > 0)) ||
    languageMismatches.length > 0 ||
    presetBookMismatch ||
    presetSubjectMismatch ||
    // 이상 문자(간체자 등)는 그 단계만 고친다 — 실측(2026-10-24): 두 글자(意识) 때문에 신문 4단계를 전부 다시 썼다. CORRUPTION_FULL_RETRY=on이면 예전처럼.
    (corruptedSections.length > 0 && (!fixes || process.env.CORRUPTION_FULL_RETRY === "on")) ||
    uncitedBookMentions.length > 0 ||
    bookMentionsNeedingVerification.length > 0 ||
    (!fixes && missingItems.length > 0) ||
    authorMismatches.length > 0;
  // 품질 개선판: 소제목 항목 누락도 전체 재생성이 아니라 그 단계만 보완한다(전체 재생성은 멀쩡한 다른 단계까지 다시 쓰고 약 15초가 더 든다).
  const itemGaps: CoverageGap[] = fixes && !needsFullRetry ? missingItems.map((m) => ({ label: m.label, missing: m.missing.map((x) => `"### ${x}" 소제목과 그 내용`) })) : [];
  const corruptionGaps: CoverageGap[] = fixes && !needsFullRetry
    ? corruptedSections.filter((l) => attempt.sections.some((s) => s.label === l)).map((label) => ({ label, missing: ["글 속에 섞인 한국어가 아닌 글자(한자·다른 나라 문자)를 뜻에 맞는 한국어 낱말로 바꿀 것 — 다른 문장은 그대로"] }))
    : [];
  if (!needsFullRetry && (flowingGaps.length > 0 || repetitionIssue || grammarGaps.length > 0 || itemGaps.length > 0 || corruptionGaps.length > 0 || activityRewrites.length > 0)) {
    const merged: CoverageGap[] = [];
    for (const g of [...flowingGaps, ...itemGaps, ...grammarGaps, ...corruptionGaps]) {
      const same = merged.find((m) => m.label === g.label);
      if (same) same.missing = [...same.missing, ...g.missing];
      else merged.push({ ...g, missing: [...g.missing] });
    }
    // 안내문이 요구한 항목·표·날조 문장 수정이 섞여 있으면 "필수"로 본다(되풀이 정리만 남았으면 건너뛰어도 된다).
    const requiredRepair = merged.length > 0 || activityRewrites.length > 0;
    if (!overBudget("단계 부분 보완", requiredRepair ? "required" : "optional"))
      attempt = await repairLocally(attempt, elements, merged, repetitionIssue ? repeatedPairs : [], activityRewrites);
  }
  if (needsFullRetry && !overBudget("전체 재생성")) {
    console.warn(
      `[generateEssay] 품질 문제 감지, 1회 재시도: cliches=${JSON.stringify(cliches)} unsupportedSuperlatives=${JSON.stringify(unsupportedSuperlatives)} languageMismatches=${JSON.stringify(languageMismatches)} presetBookMismatch=${presetBookMismatch} corruptedSections=${JSON.stringify(corruptedSections)} uncitedBookMentions=${JSON.stringify(uncitedBookMentions)} bookMentionsNeedingVerification=${bookMentionsNeedingVerification.length}건 lengthIssues=${lengthIssues.length}건`
    );
    try {
      const correctionParts: string[] = [];
      if (presetBookMismatch && input.presetBook) {
        correctionParts.push(
          `[책 제목 정정 지시 — 반드시 지킬 것] 이 과제는 반드시 『${input.presetBook.title}』${input.presetBook.author ? `(저자: ${input.presetBook.author})` : ""}` +
            ` 한 권만 다뤄야 하는데, 방금 쓴 글은 이 책이 아니라 전혀 다른 책을 다뤘다. 이번에는 반드시 지정된 ` +
            `이 책 하나만 다뤄서 다시 쓸 것 — 다른 책으로 바꾸지 말 것.`
        );
      }
      if (presetSubjectMismatch && input.presetSubject) {
        correctionParts.push(
          `[다룰 대상 정정 지시 — 반드시 지킬 것] 이 과제는 반드시 「${input.presetSubject.name}」 한 명(하나)만 다뤄야 하는데, 방금 쓴 글은 다른 대상을 다뤘다. ` +
            `이번에는 지정된 이 대상만으로 처음부터 다시 쓸 것 — 다른 대상으로 바꾸지 말 것.`
        );
      }
      if (languageMismatches.length > 0) {
        correctionParts.push(
          `[언어 정정 지시 — 반드시 지킬 것] 다음 단계는 지정된 언어로 써야 하는데 한국어로 써버렸다: ` +
            `${languageMismatches.join(", ")}. 이번에는 반드시 지정된 언어로만(한국어 문장 없이) 다시 쓸 것.`
        );
      }
      if (cliches.length > 0) {
        correctionParts.push(
          `[문체 재작성 지시 — 반드시 지킬 것] 방금 쓴 글에서 다음과 같은 상투적 표현을 사용했다: ` +
            `${cliches.join(", ")}. 이미 규칙에서 이런 공식화된 위로·결어를 쓰지 말라고 정해뒀는데도 ` +
            `반복해서 나왔다. 이번에는 이 표현들을 절대 쓰지 말고, 마무리를 완전히 다른 방식으로 쓸 것 — ` +
            `예를 들어 구체적인 다음 계획을 제안하며 끝내거나, 질문을 던지며 끝내거나, 앞서 언급한 ` +
            `구체적인 디테일을 다시 살짝 언급하며 자연스럽게 끝내는 식으로.`
        );
      }
      if (unsupportedSuperlatives.length > 0) {
        correctionParts.push(
          `[과장 표현 정정 지시 — 반드시 지킬 것] 방금 쓴 글의 다음 단계에서 "최초/유일/결정적" 같은 ` +
            `절대적 표현을 각주(근거) 없이 사용했다: ${unsupportedSuperlatives.join(", ")}. 이번에는 검색으로 ` +
            `실제로 그렇게 확인되면 그 문장에 [n] 각주를 붙이고, 확인이 안 되면 절대적 표현 대신 ` +
            `"~하는 데 큰 역할을 했다"처럼 근거만큼만 정확하게 표현할 것.`
        );
      }
      if (corruptedSections.length > 0) {
        correctionParts.push(
          `[문자 오류 정정 지시 — 반드시 지킬 것] 방금 쓴 글의 다음 부분에 한글/영문/숫자/일반 문장부호가 ` +
            `아닌 이상한 문자(아랍 문자 등 전혀 다른 문자 체계)가 실수로 섞여 나왔다: ${corruptedSections.join(", ")}. ` +
            `이번에는 처음부터 끝까지 한국어 문장(필요하면 영문·숫자·일반 문장부호만)으로만 다시 쓸 것 — ` +
            `한글이나 영문이 아닌 다른 문자 체계의 글자는 단 하나도 쓰지 말 것.`
        );
      }
      for (const issue of lengthIssues) {
        correctionParts.push(buildLengthCorrectionMessage(issue));
      }
      for (const m of missingItems) {
        correctionParts.push(
          `[필수 항목 누락 정정 지시 — 반드시 지킬 것] "${m.label}" 단계에서 안내문이 요구한 다음 필수 ` +
            `항목이 "### 항목명" 소제목으로 존재하지 않거나 내용이 비어 있다: ${m.missing.join(", ")}. ` +
            `이번에는 누락된 항목을 각각 항목명 그대로의 "### " 소제목으로 추가해 실제 내용으로 채울 것 — ` +
            `이미 있던 다른 항목의 내용·사실(연도, 이름, 수치, 출처)은 바꾸지 말고 그대로 유지할 것.`
        );
      }
      for (const g of grammarGaps) {
        correctionParts.push(`[필수 어법 정정 지시 — 반드시 지킬 것] "${g.label}" 단계: ${g.missing.join(" / ")}.`);
      }
      for (const g of flowingGaps) {
        correctionParts.push(
          `[필수 항목 누락 정정 지시 — 반드시 지킬 것] "${g.label}" 단계에서 안내문이 요구한 다음 내용이 다뤄지지 않았다: ${g.missing.join(", ")}. ` +
            `이번에는 이 내용을 그 단계의 형식에 맞게 실제 문장으로 추가할 것 — 이미 있던 사실(연도, 이름, 수치, 출처)은 바꾸지 말 것.`
        );
      }
      if (repetitionIssue) {
        correctionParts.push(
          `[반복 정정 지시 — 반드시 지킬 것] 다음 문장이 서로 다른 항목·단계에 거의 그대로 되풀이됐다: ${repeatedPairs.slice(0, 4).map(describePair).join(" / ")}. ` +
            `각 항목·단계는 그 항목만의 내용만 쓰고, 같은 사실은 한 곳에서만 자세히 쓰되 다른 곳에서 꼭 필요하면 다른 표현으로 짧게만 언급할 것. 사실(연도·이름·수치)은 바꾸지 말 것.`
        );
      }
      for (const mismatch of authorMismatches) {
        correctionParts.push(
          `[저자 오류 정정 지시 — 반드시 지킬 것] "${mismatch.title}"의 저자를 "${mismatch.claimedAuthor}"라고 ` +
            `표기했는데, 별도로 서지정보를 검색해서 대조해본 결과 실제 저자는 "${mismatch.confirmedAuthor}"다` +
            `${mismatch.source ? `(출처: ${mismatch.source.title})` : ""}. 이번에는 이 책을 언급하는 모든 ` +
            `단계에서 저자명을 "${mismatch.confirmedAuthor}"으로 정확히 정정할 것 — 책 제목·인용구 등 이미 ` +
            `확정된 다른 사실은 그대로 유지할 것.`
        );
      }
      if (uncitedBookMentions.length > 0) {
        correctionParts.push(
          `[책 언급 각주 재검증 지시 — 반드시 지킬 것] 방금 쓴 글에서 다음 단계는 책 제목을 ` +
            `언급하면서도 그 단계 전체에 각주가 하나도 없었다: ${uncitedBookMentions.join(" / ")}. ` +
            `아마 여러 사실(취업/진로 상황, 책 정보 등)을 한 번의 포괄적인 검색으로 뭉뚱그려서 ` +
            `각주가 엉뚱한 문장에 붙고 정작 책 언급 문장에는 안 붙은 것으로 보인다. 이번에는 책 ` +
            `제목·저자·출판사 정보를 그 책만 따로 검색해서 확인하고, 그 정보가 나오는 문장에 ` +
            `정확히 [n] 각주를 붙일 것.`
        );
      }

      // 검증 실패로 어떻게 표시할지보다, 애초에 원문을 찾아내는 성공률 자체를
      // 올리는 게 이번 라운드의 핵심이다 — 그래서 "빼거나 확인해라"는 일반적인
      // 지시 대신, 우리가 직접 여러 각도의 검색어로 미리 검증을 시도해보고
      // 그 확정된 결과(성공/실패)를 재생성 프롬프트에 그대로 넘긴다. 최대
      // 1건만 검증한다 — 이 과제 유형상 책 하나가 보통이고, generateOnce()
      // 자체가 이미 그라운딩 호출 2번(stageA+stageB)이라 여러 건을 순차로
      // 검증하면 라우트의 60초 제한에 가까워질 위험이 있다.
      // 같은 책이 여러 섹션(책처방전+편지 등)에서 각각 검증 필요로 잡힐 수
      // 있는데, 책 단위로 한 번만 검증해서 그 결과를 모든 섹션에 동일하게
      // 적용해야 "단일 진실 소스" 원칙이 성립한다 — 섹션별로 따로 검증하면
      // 결과가 갈릴 수 있다(실제로 겪은 버그). 제목 기준으로 먼저 중복 제거.
      const distinctBookMentionsNeedingVerification = Array.from(
        new Map(bookMentionsNeedingVerification.map((m) => [normalizeBookTitleKey(m.title), m])).values()
      );
      const MAX_VERIFICATIONS = 1;
      let verificationSuccesses = 0;
      for (const mention of distinctBookMentionsNeedingVerification.slice(0, MAX_VERIFICATIONS)) {
        const result = await verifyExcerpt({
          name: mention.title,
          attribution: mention.author,
          excerptCandidate: mention.candidateQuote,
        });
        quoteVerificationByTitle.set(normalizeBookTitleKey(mention.title), result);
        if (result.verified && result.confirmedExcerpt) {
          verificationSuccesses++;
          correctionParts.push(
            `[인용구 재검증 지시 — 반드시 지킬 것] "${mention.title}"의 인상 깊은 구절을 별도로 여러 ` +
              `각도의 검색어로 미리 검증해봤다. 다음 검색어로 검색하면 실제로 원문이 노출된 페이지가 ` +
              `확인된다: 검색어 '${result.matchedQuery ?? ""}', 확인된 문장: "${result.confirmedExcerpt}" ` +
              `(출처: ${result.source?.title ?? result.source?.url}). 이번에는 반드시 이 검색어로 직접 ` +
              `검색해서 이 문장이 실제로 노출된 페이지를 확인하고, 확인되면 이 책을 언급하는 모든 단계` +
              `(책처방전·편지 등 전부)에서 정확히 이 문장을 동일하게 따옴표로 직접 인용하고 [n] 각주를 ` +
              `붙일 것 — 단계마다 다른 문장을 쓰지 말 것.`
          );
        } else {
          correctionParts.push(
            `[인용구 재검증 지시 — 반드시 지킬 것] "${mention.title}"의 인상 깊은 구절을 별도로 다음 ` +
              `검색어들로 순서대로 모두 시도해봤지만(${result.queriesTried.map((q) => `'${q}'`).join(", ") || "검색 자체가 안 됨"}) ` +
              `원문이 노출된 페이지를 끝내 찾지 못했다. 이번에는 이 책을 언급하는 모든 단계(책처방전·편지 ` +
              `등 전부)에서 그 구절을 절대 따옴표로 직접 인용하지 말 것 — 대신 따옴표 없이 자연스러운 ` +
              `문장으로 "이 책에서는 ~라는 이야기를 전한다"처럼 패러프레이즈로 그 자리를 채울 것("인상 ` +
              `깊은 구절" 항목 자체는 빼지 말 것). 별도의 "직접 인용 아님" 안내 문구는 덧붙이지 말 것.`
          );
        }
      }
      console.log(
        `[generateEssay] 인용구 검증 요약: 대상=${distinctBookMentionsNeedingVerification.length}건(책 단위) ` +
          `시도=${Math.min(distinctBookMentionsNeedingVerification.length, MAX_VERIFICATIONS)}건 성공=${verificationSuccesses}건`
      );

      // 실제로 관찰된 버그: 교정 지시를 그냥 [학생이 추가로 입력한 지침]에
      // 얹어서 처음부터 다시 쓰게 하면, 지적받지 않은 다른 단계까지 모델이
      // 통째로 새로 써버려서 원래 괜찮았던 분량/내용이 오히려 나빠질 수 있다
      // (분량 재시도를 테스트하다가 실제로 목격 — 개요를 늘리라고 했더니
      // 지적한 적 없는 본문이 750~850자 목표에서 595자로 더 나빠졌다).
      // previousOutputText(기존에 F6 재생성용으로 이미 있던 "이전 버전은
      // 그대로 두고 [재생성 요청]만 반영" 메커니즘)를 내부 품질 재시도에도
      // 재사용해서, 지적한 부분만 고치고 나머지는 그대로 유지하도록 앵커링한다.
      const originalMarkdown = attempt.sections.map((s) => `## ${s.label}\n\n${s.content}`).join("\n\n");
      const retryInput: GenerateEssayInput = {
        ...input,
        previousOutputText: originalMarkdown,
        revisionInstructions: [input.revisionInstructions, ...correctionParts].filter(Boolean).join("\n\n"),
      };
      const retryAttempt = await generateOnce(retryInput, elements);

      // 실제로 관찰된 버그: 재시도의 stageA 자체 검색이 이번엔 아예 호출되지
      // 않아서(모델이 확률적으로 검색을 생략하는 건 이미 여러 번 문서화된
      // 한계 — verifyExcerpt가 미리 확인해준 좋은 출처를 넘겨줘도 재시도가
      // 그걸 무시하고 자기 검색을 아예 안 하는 경우가 실제로 있었다) 원본은
      // 출처가 있었는데 재시도는 출처가 0개로 완전히 퇴보하는 경우가 있었다.
      // 예전 코드는 이런 경우도 무조건 재시도 결과로 덮어써서, "1/4 단계
      // 미검증"이 "4/4 단계 전부 미검증"으로 더 나빠지는데도 그대로 채택되는
      // 문제가 있었다 — 재시도가 원본보다 명백히 더 나쁘면(그라운딩이 있던
      // 원본을 완전히 무출처로 만들면) 재시도를 버리고 원본을 그대로 쓴다.
      const retryRegressedGrounding = retryAttempt.sources.length === 0 && attempt.sources.length > 0;
      if (retryRegressedGrounding) {
        console.warn(
          `[generateEssay] 재시도가 원본보다 그라운딩이 더 나빠짐(원본 출처=${attempt.sources.length}건, ` +
            `재시도 출처=0건) — 재시도 결과를 버리고 원본 유지`
        );
      } else if (retryAttempt.insufficientReasons.length === 0) {
        const stillHasCliches = detectCliches(retryAttempt.sections);
        const stillHasUnsupportedSuperlatives = detectUnsupportedSuperlatives(retryAttempt.sections);
        const stillHasLanguageMismatches = detectLanguageMismatches(retryAttempt.sections, elements, input.subject);
        const stillHasPresetBookMismatch = detectPresetBookMismatch(retryAttempt.sections, input.presetBook);
        const stillHasCorruption = [
          ...detectForeignScriptCorruption(retryAttempt.sections),
          ...(retryAttempt.summaryLines.some((l) => hasForeignScriptCorruption(l)) ? ["전체 요약"] : []),
        ];
        const stillHasUncitedBooks = isBookTask ? detectUncitedBookMentions(retryAttempt.sections) : [];
        const stillNeedsVerification = excerptRequired ? extractBookMentionsNeedingVerification(retryAttempt.sections, retryAttempt.sources, !isBookTask).filter((b) => isBookTask || !!b.candidateQuote) : [];
        const stillHasLengthIssues = checkLengthCompliance(retryAttempt.sections, elements);
        const stillMissingItems = detectMissingRequiredItems(retryAttempt.sections);
        if (stillMissingItems.length > 0) {
          console.warn(`[generateEssay] 재시도 후에도 필수 항목 누락(경고 표시): ${JSON.stringify(stillMissingItems)}`);
        }
        // 저자 재대조는 검색을 다시 안 한다(비용 절감) — 이미 확인해둔
        // confirmedAuthor 문자열과 재시도가 실제로 정정했는지만 비교한다.
        const retryBooksWithAuthor = extractDistinctBookMentions(retryAttempt.sections).filter((b) => b.author);
        const stillHasAuthorMismatches = authorMismatches.filter((mismatch) => {
          const retried = retryBooksWithAuthor.find((b) => normalizeBookTitleKey(b.title) === normalizeBookTitleKey(mismatch.title));
          return !retried || !sameAttribution(retried.author!, mismatch.confirmedAuthor);
        });
        if (
          stillHasCliches.length > 0 ||
          stillHasUnsupportedSuperlatives.length > 0 ||
          stillHasLanguageMismatches.length > 0 ||
          stillHasPresetBookMismatch ||
          stillHasCorruption.length > 0 ||
          stillHasUncitedBooks.length > 0 ||
          stillNeedsVerification.length > 0 ||
          stillHasLengthIssues.length > 0 ||
          stillHasAuthorMismatches.length > 0
        ) {
          console.warn(
            `[generateEssay] 재시도 후에도 품질 문제 남음(그대로 진행): cliches=${JSON.stringify(stillHasCliches)} unsupportedSuperlatives=${JSON.stringify(stillHasUnsupportedSuperlatives)} languageMismatches=${JSON.stringify(stillHasLanguageMismatches)} presetBookMismatch=${stillHasPresetBookMismatch} corruptedSections=${JSON.stringify(stillHasCorruption)} uncitedBookMentions=${JSON.stringify(stillHasUncitedBooks)} stillNeedsVerification=${JSON.stringify(stillNeedsVerification)} stillHasLengthIssues=${JSON.stringify(stillHasLengthIssues)} stillHasAuthorMismatches=${JSON.stringify(stillHasAuthorMismatches)}`
          );
        }
        attempt = retryAttempt;
      }
    } catch (err) {
      console.error("[generateEssay] 품질 재시도 실패(원래 결과로 진행)", err);
    }
  }

  // 재시도가 "모든 단계에서 동일한 문장을 쓰라"는 지시를 실제로 따랐는지는
  // 보장할 수 없다(프롬프트 지시만으론 100% 안 지켜진다는 게 이 프로젝트에서
  // 반복 확인된 패턴) — 그래서 위에서 이미 확정해둔 검증 결과를 그 책을
  // 언급하는 모든 섹션에 기계적으로 강제 적용해서 확실히 통일한다(검색 재호출
  // 없음). stripWeaklySourcedQuotes보다 먼저 실행 — 여기서 이미 신뢰 가능한
  // 출처로 확정된 인용구는 뒤에서 다시 벗겨내지 않아야 한다.
  const { sections: unifiedQuoteSections, sources: unifiedQuoteSources } = await applyCanonicalQuotes(
    attempt.sections,
    attempt.sources,
    quoteVerificationByTitle
  );
  attempt = { ...attempt, sections: unifiedQuoteSections, sources: unifiedQuoteSources };

  // 검색/재시도를 다 거친 뒤에도 "따옴표 있음 + 약한/무 출처"가 남을 수 있다
  // (예: 재생성 시 모델이 스스로 재검색해서 다른 출처를 골랐는데 그게 위키/
  // 동영상/블로그인 경우 — 실제로 관찰됨). 모델에게 다시 묻는 대신 여기서
  // 기계적으로 확정 처리한다.
  const { sections: finalSections, strippedCount } = stripWeaklySourcedQuotes(attempt.sections, attempt.sources);
  if (strippedCount > 0) {
    attempt = { ...attempt, sections: finalSections };
  }

  // 마찬가지로, 사실 검증이 필요 없는 서술 문장(고민 쓰기/고민 분석처럼
  // 학생 본인·친구의 감정·상황을 관찰하는 단계)에 불필요한 각주가 붙는
  // 오탐도 실제로 관찰됐다 — 모델에게 다시 묻지 않고 기계적으로 제거한다.
  // 조사→글쓰기 경로의 각주는 코드가 사실 번호에서 붙인 것(사실을 쓴 문장에만)이라 이 추정 규칙으로 지우지 않는다 — 실측에서 발표 대본의 각주 14개 중 11개가 여기서 사라졌다.
  const { sections: narrativeCleanedSections, strippedCount: narrativeStrippedCount } = attempt.notes
    ? { sections: attempt.sections, strippedCount: 0 }
    : stripUnjustifiedNarrativeCitations(attempt.sections);
  if (narrativeStrippedCount > 0) {
    attempt = { ...attempt, sections: narrativeCleanedSections };
  }
  // 조사→글쓰기 경로는 위 추정 규칙을 쓰지 않으므로, 1인칭·생각 종결 + 숫자·책 제목·인용 없음인 감상 문장의 각주만 좁게 걷어낸다(opinion-citations.ts).
  if (fixes && attempt.notes) {
    let opinionStripped = 0;
    const sections = attempt.sections.map((s) => {
      const r = stripOpinionCitations(s.content);
      opinionStripped += r.stripped;
      return r.stripped ? { ...s, content: r.content } : s;
    });
    if (opinionStripped > 0) {
      console.warn(`[generateEssay] 감상·의견 문장의 각주 ${opinionStripped}개 제거`);
      attempt = { ...attempt, sections };
    }
  }

  // 재시도까지 거치고도 상투구("힘내자!" 등)가 남을 수 있다는 게 실측으로
  // 확인됐다(6·7단계 실제 테스트) — 모델에게 또 묻지 않고 그 문장을 통째로
  // 제거한다(stripCliches() 설명 참고).
  const { sections: clicheCleanedSections, strippedLabels: clicheStrippedLabels } = stripCliches(attempt.sections);
  if (clicheStrippedLabels.length > 0) {
    attempt = { ...attempt, sections: clicheCleanedSections };
  }

  // 재시도까지 거치고도 근거 없는 절대적 표현("최초로", "유일하게" 등)이
  // 남을 수 있다 — 코드가 확정적으로 제거한다(stripUnsupportedSuperlatives() 설명 참고).
  const { sections: superlativeCleanedSections, strippedCount: superlativeStrippedCount } =
    stripUnsupportedSuperlativesFromSections(attempt.sections);
  if (superlativeStrippedCount > 0) {
    attempt = { ...attempt, sections: superlativeCleanedSections };
  }

  // 검색 그라운딩이 전혀 없었는데(sources=0) 자기 생성 "출처:" 목록이 남아
  // 있을 수 있다 — 코드가 확정적으로 제거한다(stripFakeReferenceList() 참고).
  if (attempt.sources.length === 0) {
    const { sections: refListCleanedSections, strippedLabels: refListStrippedLabels } =
      stripFakeReferenceListFromSections(attempt.sections);
    if (refListStrippedLabels.length > 0) {
      attempt = { ...attempt, sections: refListCleanedSections };
    }
  }

  // 재시도까지 거치고도 이상 문자(다른 문자 체계)가 남을 수 있다 — 코드가
  // 확정적으로 제거한다(stripForeignScriptCorruption() 설명 참고).
  const { sections: scriptCleanedSections, strippedLabels: scriptStrippedLabels } = stripForeignScriptCorruption(
    attempt.sections
  );
  if (scriptStrippedLabels.length > 0) {
    attempt = { ...attempt, sections: scriptCleanedSections };
  }

  // summary_lines(전체 요약)도 본문과 마찬가지로 학생의 분석/의견 문장에
  // 검색 각주가 잘못 붙는 오탐이 있었다("관계를 억지로 좁히기보다... 태도의
  // 필요성을 분석했습니다[1]") — 위 stripUnjustifiedNarrativeCitations는
  // RawSection(섹션 본문)만 대상으로 해서 summary_lines는 거치지 않았다.
  const { summaryLines: cleanedSummaryLines, strippedCount: summaryStrippedCount } = stripUnjustifiedSummaryCitations(
    attempt.summaryLines
  );
  if (summaryStrippedCount > 0) {
    attempt = { ...attempt, summaryLines: cleanedSummaryLines };
  }

  // 실제로 보고된 사고가 정확히 이 필드(summary_lines)에서 일어났다 — 문장
  // 맨 앞에 아랍 문자 하나가 끼어든 사례. 본문과 같은 최종 안전망 적용.
  const { summaryLines: scriptCleanedSummaryLines, strippedCount: scriptSummaryStrippedCount } =
    stripForeignScriptFromSummary(attempt.summaryLines);
  if (scriptSummaryStrippedCount > 0) {
    attempt = { ...attempt, summaryLines: scriptCleanedSummaryLines };
  }

  // 실제로 발견된 버그: 전체 요약(summary_lines)에 본문과 다른 책 제목이
  // 나온 적이 있다(요약엔 "《나도 아는 내 마음》", 본문엔 "《나도 아직 나를
  // 모른다》" — 실존하는 책은 본문 쪽이 맞았다). applyCanonicalQuotes()는
  // 인용구(quote)만 섹션 간에 통일시켰을 뿐 책 "제목" 자체는 요약이 본문과
  // 독립적으로(stage A가 맨 위 요약 불릿을 쓸 때 본문과 별개로) 다시 지어낼
  // 수 있는 채로 남아 있었다. 이제 본문에서 이미 확정된(재시도·통일을 다
  // 거친) 책 제목을 "단일 진실 소스"로 삼아 요약에도 그대로 반영한다 — 책이
  // 정확히 1권일 때만 적용한다(여러 권이면 요약의 어느 제목이 어느 책을
  // 가리키는지 코드가 확신할 수 없어 잘못 바꿔치기할 위험이 있다).
  const finalBookMentions = extractDistinctBookMentions(attempt.sections);
  if (finalBookMentions.length === 1) {
    const { summaryLines: titleUnifiedSummaryLines, changedCount: titleChangedCount } = unifyBookTitleInSummary(
      attempt.summaryLines,
      finalBookMentions[0].title
    );
    if (titleChangedCount > 0) {
      console.warn(
        `[generateEssay] 요약(summary_lines)의 책 제목을 본문 기준으로 통일함: "${finalBookMentions[0].title}" (${titleChangedCount}건)`
      );
      attempt = { ...attempt, summaryLines: titleUnifiedSummaryLines };
    }
  }

  // 외국어 단계가 아닌데 영어로 쓰였거나 영어 제목·문장이 섞인 단계는 그 단계만 한국어로 다시 쓴다(분량 보정보다 먼저 — 번역 뒤 분량을 다시 맞춘다).
  if (koreanGuardOn() && !overBudget("한국어 재작성 검사")) {
    const targets = attempt.sections.filter((sec) => {
      const el = elements.find((e) => e.label === sec.label);
      return !!el && !detectElementLanguage(input.subject, el) && !!koreanLanguageIssue(sec.content);
    });
    if (targets.length > 0) {
      console.warn(`[generateEssay] 한국어 단계에 영어 감지: ${JSON.stringify(targets.map((t) => ({ label: t.label, ...koreanLanguageIssue(t.content) })))}`);
      const fixed = await Promise.all(
        attempt.sections.map(async (sec) => {
          if (!targets.includes(sec)) return sec;
          const el = elements.find((e) => e.label === sec.label);
          try {
            const res = await generate({ label: "generateEssay:koreanFix", role: "write", prompt: koreanRewritePrompt(sec.label, sec.content, el?.description ?? ""), effort: writeEffort() });
            const next = res.text.trim();
            if (acceptKoreanRewrite(sec.content, next)) {
              console.log(`[generateEssay] 한국어로 다시 씀 label="${sec.label}" (${sec.content.length}→${next.length}자)`);
              return { ...sec, content: next };
            }
            console.warn(`[generateEssay] 한국어 재작성 거부(각주 변경 또는 영어가 남음) label="${sec.label}"`);
          } catch (err) {
            console.error("[generateEssay] 한국어 재작성 실패(원문 유지)", err);
          }
          return sec;
        })
      );
      attempt = { ...attempt, sections: fixed };
    }
  }

  // 시험지·안내문의 장면·문장·문단 수 조건: 생성 뒤 코드로 세고, 어긴 단계만 검색 없이 한 번 고친다(form-repair.ts). 못 맞추면 경고로 알린다.
  const formWarningByLabel = new Map<string, string>();
  if (formOn && !overBudget("형식 조건 보완")) {
    const checked = await Promise.all(
      attempt.sections.map(async (sec) => {
        const el = elements.find((e) => e.label === sec.label);
        if (!el) return sec;
        const reqs = requirementsForElement(el, input.coreTaskInfo.requirements, input.coreTaskInfo.writing_guide, input.coreTaskInfo.task_elements.map((e) => e.label));
        const skipScene = isSceneListElement(el);
        const issues = checkFormRequirements(sec.content, reqs, { skipScene });
        if (issues.length === 0) return sec;
        console.warn(`[generateEssay] 형식 조건 위반 label="${sec.label}": ${JSON.stringify(issues.map((i) => ({ unit: i.req.word, min: i.req.min, max: i.req.max, actual: i.actual })))}`);
        const r = await repairFormRequirements({ label: sec.label, content: sec.content, description: el.description, reqs, issues, skipScene });
        console.log(`[generateEssay] 형식 조건 보완 label="${sec.label}" 적용=${r.repaired} 남은 위반=${r.remaining.length}건`);
        if (r.remaining.length > 0) formWarningByLabel.set(sec.label, formWarningText(r.remaining));
        return r.repaired ? { ...sec, content: r.content } : sec;
      })
    );
    attempt = { ...attempt, sections: checked };
  }

  // 품질 재시도까지 거치고도 분량 범위를 못 맞춘 단계는, 검색 없이 그 단계 글 하나만 한 번 보정한다(전체 재생성은 오히려 분량이 흔들린다 — 실측 1344→1294자).
  {
    const remaining = overBudget("분량 보정") ? [] : checkLengthCompliance(attempt.sections, elements);
    if (remaining.length > 0) {
      const adjusted = await Promise.all(
        attempt.sections.map(async (sec) => {
          const issue = remaining.find((i) => i.label === sec.label);
          if (!issue) return sec;
          const el = elements.find((e) => e.label === sec.label);
          try {
            const next = await adjustSectionLength(sec.content, issue, el?.description ?? "");
            if (next) {
              console.log(`[generateEssay] 분량 보정 적용 label="${sec.label}" ${issue.actual}${unitWord(issue.unit)} -> ${issue.unit === "words" ? countWords(next) : countChars(next, issue.countsSpaces)}`);
              return { ...sec, content: next };
            }
          } catch (err) {
            console.error("[generateEssay] 분량 보정 실패(원문 유지)", err);
          }
          return sec;
        })
      );
      attempt = { ...attempt, sections: adjusted };
    }
  }

  // 재시도까지 거치고도 분량 기준을 못 맞춘 단계는, 조용히 최종본인 척
  // 내보내지 않고 정직하게 알린다 — lengthWarning은 사용자에게 그대로
  // 보여줄 문구다(ResultPanel.tsx에서 렌더링).
  const finalLengthIssues = checkLengthCompliance(attempt.sections, elements);
  if (finalLengthIssues.length > 0) {
    console.warn(`[generateEssay] 재시도 후에도 분량 기준 미달(경고 표시): ${JSON.stringify(finalLengthIssues)}`);
  }
  const lengthWarningByLabel = new Map(
    finalLengthIssues.map((issue) => [
      issue.label,
      `분량 기준을 완전히 맞추지 못했습니다. 목표: ${lengthRangeText(issue)}, 실제 ${issue.unit === "words" ? "단어 수" : "글자수"}: ${issue.actual}${unitWord(issue.unit)}${issue.unit === "words" ? "" : `(${issue.countsSpaces ? "공백 포함" : "공백 제외"})`}.`,
    ])
  );

  // 저자 정정도 재시도까지 거치고 나서 최종적으로 다시 확인한다(검색 없이,
  // 이미 확보한 confirmedAuthor와 최종 본문의 저자 표기만 비교) — 여전히
  // 다르면 조용히 넘어가지 않고 정직하게 알린다. 같은 책을 언급하는 섹션이
  // 여러 개(책 처방전 + 편지)면 전부에 붙는다(제목으로 매칭하므로).
  const finalBooksWithAuthor = extractDistinctBookMentions(attempt.sections).filter((b) => b.author);
  const authorWarningByTitle = new Map<string, string>();
  for (const mismatch of authorMismatches) {
    const stillWrong = finalBooksWithAuthor.find(
      (b) =>
        normalizeBookTitleKey(b.title) === normalizeBookTitleKey(mismatch.title) &&
        !sameAttribution(b.author!, mismatch.confirmedAuthor)
    );
    if (stillWrong) {
      console.warn(`[generateEssay] 재시도 후에도 저자 불일치(경고 표시): ${JSON.stringify(mismatch)}`);
      authorWarningByTitle.set(
        normalizeBookTitleKey(mismatch.title),
        `저자 정보가 불확실합니다. 표기된 저자: "${stillWrong.author}", 검색으로 확인된 실제 저자: "${mismatch.confirmedAuthor}".`
      );
    }
  }

  // 각주 제거 등으로 남은 " ." 공백과 소제목의 「」 표기를 최종 정리한다.
  // 실험용 학생 문체 후처리(기본 OFF): 문두 접속어 / "~임을 알 수 있다" — 문장 단위 재작성 + 규칙·의미 검증을 통과한 문장만 교체한다.
  // 각주 번호·숫자·이름은 검증에서 바뀌면 거부되고, 실패하면 원문을 그대로 둔다(style-postprocess.ts 참고).
  if (STYLE_POSTPROCESS_FLAGS.connective() || STYLE_POSTPROCESS_FLAGS.conclusion()) {
    const processed = await Promise.all(
      attempt.sections.map(async (sec) => {
        const r = await postprocessStyle(sec.content);
        const applied = r.reports.reduce((n, x) => n + x.applied.length, 0);
        if (applied > 0) console.log(`[generateEssay] 문체 후처리 적용 label="${sec.label}" ${applied}문장`);
        return { ...sec, content: r.text };
      })
    );
    attempt = { ...attempt, sections: processed };
  }

  // 모델이 스스로 붙인 "참고 각주" 목록(번호가 실제 출처와 어긋남)과 신문 기사 안의 작업 표기("(해석)")를 걷어낸다 — 출처는 화면이 따로 보여 준다.
  // 제출용 보고서도 신문처럼 "(해석)" 같은 작업 표기를 남기지 않는다. 본문 속 주소 표기는 검색이 연 페이지로 확인된 것이 아니므로 지운다(출처는 화면이 따로 보여 준다).
  const newspaperLabels = new Set(
    elements
      .filter((e) => inferDeliverableForm(e) === "newspaper" || (fixes && (isFinalReportForm(e) || (e.items_format === "sections" && !isResearchMaterialStep(e)))))
      .map((e) => e.label)
  );
  attempt = {
    ...attempt,
    sections: attempt.sections.map((s) => {
      const refStripped = stripModelReferenceBlock(s.content);
      if (refStripped.stripped) console.warn(`[generateEssay] 모델이 쓴 참고 각주 목록 제거 label="${s.label}"`);
      const metaStripped = stripMetaNoteLines(refStripped.content);
      if (metaStripped.removed > 0) console.warn(`[generateEssay] 작업 설명 괄호 줄 ${metaStripped.removed}개 제거 label="${s.label}"`);
      let content = newspaperLabels.has(s.label) ? stripWorkMarkers(metaStripped.content) : metaStripped.content;
      if (fixes) {
        // 소제목에 베껴 붙은 작성 지시("### 해결 방안 (제출용 글 — 항목마다 문단)")와 탭으로 줄 맞춘 표를 바로잡는다.
        const heading = stripHeadingDirectives(content);
        const table = tabTableToMarkdown(heading.content);
        if (heading.removed + table.converted > 0)
          console.warn(`[generateEssay] 소제목의 작성 지시 ${heading.removed}개 제거, 탭 표 ${table.converted}개를 표로 변환 label="${s.label}"`);
        content = table.content;
      }
      if (fixes) {
        const notes = stripWorkNotes(content);
        const urls = stripInlineUrls(notes.content);
        const reported = reduceReportedSpeech(urls.content);
        const josa = fixJosaAfterTitle(reported.content);
        const ordinals = stripOrdinalEnumerators(josa.content);
        if (notes.removed + urls.removed + reported.changed + josa.changed > 0)
          console.warn(`[generateEssay] 작업 메모 ${notes.removed}개·본문 주소 ${urls.removed}개 제거, 전달형 꼬리 ${reported.changed}개·제목 조사 ${josa.changed}개 정리 label="${s.label}"`);
        content = ordinals.content;
        if (ordinals.changed > 0) console.warn(`[generateEssay] 서수 나열 표지(첫째·둘째) ${ordinals.changed}개 정리`);
      }
      return { ...s, content };
    }),
  };

  // "먼저 …를 설명한다"처럼 쓸 순서를 말하는 계획 문장의 각주를 뗀다(plan-citations.ts — 그 출처 페이지에 "설명한다"는 계획이 있을 리 없다).
  // 위 서수 정리("둘째," → "다음으로")가 끝난 뒤에 봐야 한다 — 먼저 보면 서수로 시작하던 계획 문장을 놓친다(실측 2026-10-29, 3회 중 1회).
  if (fixes && attempt.notes && planCitationsOn()) {
    let planStripped = 0;
    const sections = attempt.sections.map((s) => {
      const r = stripPlanCitations(s.content);
      planStripped += r.stripped;
      return r.stripped ? { ...s, content: r.content } : s;
    });
    if (planStripped > 0) {
      console.warn(`[generateEssay] 계획·작업 서술 문장의 각주 ${planStripped}개 제거`);
      attempt = { ...attempt, sections };
    }
  }

  // 문장↔출처 대조: 인용한 페이지 본문에 문장의 연도·수치·영문 이름이 실제로 있는지 본다(링크가 열리는지와는 별개의 문제 — 실측: 출생 연도를 단체 소개 페이지에 인용).
  console.log(`[generateEssay] 각주 추적: 후처리(따옴표·서술각주·상투구 제거)후=${countMarkers(attempt.sections)} 출처=${attempt.sources.length}`);
  const tierRank = (n: number) => ({ official: 4, reliable: 3, general: 2, reference: 1, weak: 0 })[attempt.sources.find((x) => x.n === n)?.tier ?? "general"];
  const pageTexts: PageTexts = new Map(attempt.sources.map((src) => [src.n, getCachedPageText(src.url)]));
  attempt = {
    ...attempt,
    sections: attempt.sections.map((s) => {
      const { content, findings } = checkClaims(s.content, pageTexts, tierRank, { markUnsupported: unverifiedMarkOn() });
      const checkedFindings = findings.filter((f) => f.status !== "unchecked");
      if (checkedFindings.length === 0) return s;
      const count = (st: ClaimFinding["status"]) => findings.filter((f) => f.status === st).length;
      const claimCheck: ClaimCheckSummary = {
        checked: checkedFindings.length,
        supported: count("supported"),
        repointed: count("repointed"),
        unverified: count("unverified"),
        unsupported: findings.filter((f) => f.status === "unsupported").map((f) => ({ text: f.text, tokens: describeToken(f.tokens) })),
        marked: unverifiedMarkOn(),
      };
      if (claimCheck.repointed > 0 || claimCheck.unsupported.length > 0) {
        console.warn(
          `[generateEssay] 문장↔출처 대조 label="${s.label}" 검사=${claimCheck.checked} 통과=${claimCheck.supported} 각주 바로잡음=${claimCheck.repointed} 근거 미확인(각주 제거)=${claimCheck.unsupported.length} 자동확인불가=${claimCheck.unverified}`
        );
      }
      return { ...s, content, claimCheck };
    }),
  };

  // 출처 수 정리: 많이 쓰이고 신뢰도 높은 출처로 모으되(보통 3개, 안내문이 개수를 요구하면 그 수), 고른 출처가 문장을 뒷받침하지 못하면 원래 출처를 살린다(limitSources).
  {
    const wanted = requiredSourceCount([...input.coreTaskInfo.requirements, ...elements.map((e) => e.description)]);
    // 안내문이 "서로 다른 근거 N개"를 요구하는 글은 기본 한도(3개)가 근거들을 다시 한 출처로 모아 버린다 —
    // 근거 수 + 1(배경·도입 사실용)까지 남긴다. ESSAY_EVIDENCE_SLOTS=off면 예전 한도 그대로(evidence-slots.ts).
    const slots = evidenceSlotsOn()
      ? planEvidence(
          {
            topic: input.coreTaskInfo.topic,
            requirements: input.coreTaskInfo.requirements,
            writing_guide: input.coreTaskInfo.writing_guide,
            task_elements: elements,
          },
          input.instructions
        ).slots
      : 0;
    // 기본 한도 3개는 너무 공격적이었다 — 실측(저장된 생성 45회): 16회에서 본문 각주 49개가 지워졌고 24회에서 출처 32개가 목록에서 빠졌다.
    // 조사 노트가 여는 페이지가 보통 3~5곳이라 한도를 5로 두면 억지로 옮길 일이 거의 없다. SOURCE_LIMIT으로 예전 값(3)으로 되돌린다.
    const base3 = Number(process.env.SOURCE_LIMIT) || 5;
    const limit = Math.min(8, Math.max(2, wanted ?? (slots >= 2 ? Math.max(slots + 1, base3) : base3)));
    console.log(`[generateEssay] 각주 추적: 출처정리직전=${countMarkers(attempt.sections)} 출처=${attempt.sources.length}`);
    const contentsNow = attempt.sections.map((s) => s.content);
    const base = retainedAtLimit(contentsNow, attempt.sources, limit, pageTexts);
    // 작은 모델이 "이 출처도 그 문장을 뒷받침한다"고 판정하면 각주를 그쪽으로 옮기는데, 그 판정의 정확도를 사람이 확인한 적이 없다
    // (PROGRESS 2026-10-28 파일럿). 틀리면 문장과 무관한 출처가 조용히 붙는다 — 기본으로 쓰지 않고 숫자·이름이 실제로 일치할 때만 옮긴다.
    // SOURCE_JUDGE=on이면 예전처럼 모델 판정도 쓴다.
    const forced = base.items.length > 0 && process.env.SOURCE_JUDGE === "on" ? await judgeSourceSupport(base.items.slice(0, 24), base.chosen, pageTexts) : new Map<string, number>();
    const lim = limitSources(contentsNow, attempt.sources, limit, pageTexts, forced);
    if (lim.sources.length < attempt.sources.length) {
      console.log(
        `[generateEssay] 출처 정리 ${attempt.sources.length}→${lim.sources.length}개 (한도 ${limit}, 각주 옮김 ${lim.stats.repointed}, 원래 출처 유지 ${lim.stats.retained})`
      );
    }
    attempt = { ...attempt, sources: lim.sources, sections: attempt.sections.map((s, i) => ({ ...s, content: lim.contents[i] })) };
    console.log(`[generateEssay] 각주 추적: 출처정리후=${countMarkers(attempt.sections)} 출처=${attempt.sources.length}`);
  }

  // "### 제작 참고"(학생이 직접 구해 넣을 사진·그림 안내)는 제출 내용이 아니므로 본문에서 떼어 따로 보여 준다.
  attempt = {
    ...attempt,
    sections: attempt.sections.map((s) => {
      const { body, notes } = splitProductionNotes(s.content);
      return notes ? { ...s, content: body, productionNotes: notes } : s;
    }),
  };

  attempt = { ...attempt, sections: attempt.sections.map((s) => ({ ...s, content: tidyOutputText(s.content) })) };

  // 필수 항목(소제목) 구조는 재시도까지 거치고도 남은 누락만 정직하게 알린다.
  // 소제목 없는 단계(신문 등)는 처음에 누락이 확인된 경우에만 다시 판정한다(모델 호출 최소화). 떼어 둔 "제작 참고"도 포함해서 본다.
  const finalFlowingGaps =
    flowingGaps.length > 0 && !overBudget("항목 누락 재판정")
      ? await confirmCoverageGaps(
          attempt.sections.map((s) => ({ ...s, content: s.productionNotes ? `${s.content}\n\n### ${"제작 참고"}\n${s.productionNotes}` : s.content }))
        )
      : [];
  const finalMissingItems = [...detectMissingRequiredItems(attempt.sections), ...finalFlowingGaps];
  const structureWarningByLabel = new Map(
    finalMissingItems.map((m) => [
      m.label,
      `안내문이 요구한 항목이 비어 있어요: ${m.missing.join(", ")}. 제출 전에 이 항목을 직접 보완해주세요.`,
    ])
  );
  if (finalMissingItems.length > 0) {
    console.warn(`[generateEssay] 최종 필수 항목 누락(경고 표시): ${JSON.stringify(finalMissingItems)}`);
  }

  // 출처 목록에서 빠진 출처(검증 실패·약한 출처)를 가리키는 각주가 본문에 남으면 눌러 볼 근거가 없다 — 최종 목록에 있는 번호만 남기고 붙어 있는 중복 각주도 정리한다(실측: [5][2][5], 존재하지 않는 [8]).
  // 국내 출처 범위: 어느 경로(조사·검색 한 번에 쓰기·구절 확인)로 들어왔든 해외 출처는 최종 목록과 본문 번호에서 뺀다 — 아래 cleanMarkers가 남은 번호를 정리한다.
  if (currentSourceScope() === "domestic") {
    const foreign = attempt.sources.filter((x) => !isDomesticUrl(x.url));
    if (foreign.length > 0) {
      console.warn(`[generateEssay] 국내 출처 범위: 해외 출처 ${foreign.length}개 제거 ${JSON.stringify(foreign.map((x) => x.url).slice(0, 5))}`);
      attempt = { ...attempt, sources: attempt.sources.filter((x) => isDomesticUrl(x.url)) };
    }
  }
  {
    const finalNs = new Set(attempt.sources.map((x) => x.n));
    attempt = { ...attempt, sections: attempt.sections.map((sec) => ({ ...sec, content: cleanMarkers(sec.content, finalNs) })) };
  }
  // 출처 목록 항목: 그 단계 본문이 실제로 인용한 확인된 출처로 채운다(단계가 하나면 이 글의 전체 출처). 출처가 없으면 비워 두고 경고한다.
  for (const { label, item } of input.sourceListItems ?? []) {
    const idx = attempt.sections.findIndex((s) => s.label === label);
    if (idx < 0) continue;
    const sec = attempt.sections[idx];
    const usable = (list: SourceRef[]) => list.filter((x) => x.url_valid !== false && x.tier !== "weak");
    const cited = usable(sourcesCitedIn(sec.content, attempt.sources));
    const list = cited.length > 0 ? cited : attempt.sections.length === 1 ? usable(attempt.sources) : [];
    if (list.length === 0) {
      structureWarningByLabel.set(label, [structureWarningByLabel.get(label), `"${item}" 항목에 넣을 확인된 출처를 찾지 못했어요. 제출 전에 직접 출처를 찾아 넣어주세요.`].filter(Boolean).join(" "));
      continue;
    }
    console.log(`[generateEssay] 출처 목록 항목을 확인된 출처 ${list.length}개로 채움 label="${label}"`);
    const sections = [...attempt.sections];
    sections[idx] = { ...sec, content: `${stripTrailingItemHeading(sec.content, item)}\n\n${buildSourceListSection(item, list)}` };
    attempt = { ...attempt, sections };
  }
  // 요약 줄에서 각주를 지운 자리에 남는 "…되었다 ." 공백도 정리한다(본문은 tidyOutputText가 이미 정리).
  if (fixes) attempt = { ...attempt, summaryLines: attempt.summaryLines.map((l) => l.replace(/[ \t]+([.,!?])/g, "$1").trim()) };
  const markdown = attempt.sections.map((s) => `## ${s.label}\n\n${s.content}`).join("\n\n");
  console.log(`[generateEssay] latency_ms=${Date.now() - start}`);

  // 스토리보드 같은 장면 단계는 대사·화면 설명 때문에 "검증 안 됨" 배너가 불필요하게 뜨지 않게 따로 판정한다(verifiable-claims.ts).
  const sceneListLabels = new Set(formOn ? elements.filter(isSceneLikeElement).map((e) => e.label) : []);
  const researchFacts: NonNullable<EssayResult["researchFacts"]> = [];

  return {
    type: "essay",
    markdown,
    sections: attempt.sections.map((s) => {
      // 전체 문서 기준 번호(예: 이 단계가 [4]부터 시작)를 그대로 보여주면
      // 학생 입장에서 "왜 갑자기 4번부터지?"처럼 혼란스럽다 — 화면에 보여줄
      // 단계별 markdown/sources만 그 단계 안에서 1번부터 다시 매긴다. 전체
      // 문서(위 markdown, 재생성 연속성에 쓰이는 단일 진실 소스)는 원래
      // 번호를 그대로 유지한다 — 여기서 건드리는 건 카드에 보여줄 사본뿐이다.
      const { content: renumberedContent, sources: renumberedSources } = renumberSectionCitations(
        s.content,
        attempt.sources
      );
      const bookTitle = mentionedBookTitle(s);
      if (s.requiredItems) {
        // 조사 자료를 항목별 구조화 사실로 분해 — 순수 문자열 처리(LLM 재생성 아님).
        researchFacts.push({ label: s.label, items: parseResearchItems(renumberedContent) });
      }
      return {
        label: s.label,
        markdown: renumberedContent,
        sources: renumberedSources,
        lengthWarning: [lengthWarningByLabel.get(s.label), formWarningByLabel.get(s.label)].filter(Boolean).join(" ") || undefined,
        authorWarning: bookTitle ? authorWarningByTitle.get(normalizeBookTitleKey(bookTitle)) : undefined,
        noSourcesWarning: renumberedSources.length === 0 && sectionHasVerifiableClaim(s, sceneListLabels.has(s.label)),
        structureWarning:
          structureWarningByLabel.get(s.label) ??
          (fixes && !s.content.trim() ? "이 단계의 글을 만들지 못했어요. 이 단계만 다시 생성해 주세요." : undefined),
        productionNotes: s.productionNotes,
        claimCheck: s.claimCheck,
      };
    }),
    researchFacts: researchFacts.length > 0 ? researchFacts : undefined,
    structureWarning: structureWarningByLabel.size > 0 ? [...structureWarningByLabel.values()].join(" ") : undefined,
    sources: attempt.sources,
    summaryLines: attempt.summaryLines,
    // 라에네크 감사(2026-09-16): 출처가 몇 개 있어도 전부 검증 실패(url_valid
    // === false)면 학생 입장에선 "출처 없음"과 다르지 않다 — 원래는 sources.
    // length(검증 여부와 무관한 원본 개수)만 봐서, 6개 중 1개가 죽은 페이지로
    // 확인돼도 noSourcesWarning이 안 뜨는 문제가 있었다.
    noSourcesWarning:
      attempt.sources.every((s) => s.url_valid === false || s.tier === "weak") &&
      attempt.sections.some((s) => sectionHasVerifiableClaim(s, sceneListLabels.has(s.label))),
    // 추천 다양성 시스템(recommendation-diversity.ts)이 이 생성에서 실제로
    // 어떤 책이 최종 확정됐는지 기록할 수 있도록 노출한다. 책이 정확히 1권일
    // 때만 채운다(여러 권이면 어느 책을 "그 과제의 추천 항목"으로 기록해야
    // 할지 모호해서 — finalBookMentions는 위에서 이미 같은 기준으로 계산해둠).
    recommendedBookTitle: finalBookMentions.length === 1 ? finalBookMentions[0].title : undefined,
    confirmedSubject: input.presetSubject && !detectPresetSubjectMismatch(attempt, input.presetSubject) ? input.presetSubject.name : attempt.confirmedSubject || undefined,
    selection:
      subjectSelection && subjectSelection.kind === "auto"
        ? {
            name: subjectSelection.name,
            key: subjectSelection.key,
            group: subjectSelection.group,
            tier: subjectSelection.tier,
            fallbackUsed: subjectSelection.fallbackUsed,
            violated: detectPresetSubjectMismatch(attempt, input.presetSubject),
          }
        : undefined,
    latency_ms: Date.now() - start,
  };
}

// 따옴표로 묶인 인용구(책 원문 "인상 깊은 구절" 등)를 찾는다. 흔히 쓰이는
// 따옴표 종류(직선/둥근("스마트")/한글식)를 모두 커버한다 — 실제로 발견된
// 버그: 예전 정규식은 두 번째 대안도 직선따옴표를 그대로 중복해 놓은 채였고
// 정작 모델이 자주 쓰는 둥근따옴표(" ", U+201C/U+201D)는 하나도 못 잡았다.
// 그래서 둥근따옴표로 인용한 문장은 검증/약한출처 판별/마케팅 카피 판별 등
// 이 파일의 모든 인용구 검사를 그대로 통과해버리는(=아예 검사 대상에서
// 빠지는) 구멍이 있었다.

function normalizeForCompare(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/** 책 제목을 딕셔너리 키로 쓸 때 정규화한다 — 실제로 발견된 버그: 재시도마다
 * stage B가 같은 책이라도 겹낫표 포함 여부·공백을 살짝 다르게 추출할 수
 * 있어서(예: "체리새우: 비밀글입니다" vs "『체리새우: 비밀글입니다』"), 원문
 * 문자열을 그대로 Map 키로 쓰면 같은 책인데도 다른 책으로 취급돼 저자/인용구
 * 대조 결과가 재시도 이후 섹션에 조용히 적용되지 않는 문제가 실제로 있었다.
 * 화면에 보여줄 표시용 제목은 항상 원본(mentionedBookTitle 결과)을 그대로
 * 쓰고, 이 정규화는 오직 "같은 책인지 비교"할 때만 쓴다. */
export function normalizeBookTitleKey(title: string): string {
  return title.replace(/[《》『』"'"'`]/g, "").replace(/\s+/g, "").toLowerCase();
}

/** confirmed_subject(인물/사건 등 자유 선정 대상)를 빈도 집계 키로 쓸 때 정규화한다.
 * "소파 방정환 선생님" vs "방정환"처럼 재시도·재생성마다 붙는 호칭/존칭이 달라져도
 * 같은 인물로 집계되도록, 흔한 존칭 접미사를 뗀다. normalizeBookTitleKey와 다른
 * 이유로 분리했다 — 책은 겹낫표/공백만 문제지만 인물은 존칭이 주된 변주 요인. */
export function normalizeSubjectKey(subject: string): string {
  return subject
    .replace(/\s*(선생님|선생|여사|박사|교수|씨)$/u, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

// isVideoPlatformUrl/isWeakQuoteSource는 excerpt-verification.ts(범용 검증
// 모듈)에서 가져온다 — "동영상/위키가 직접 인용 근거로 신뢰할 수 없는 매체인지"
// 판별은 책 전용 개념이 아니라 그 모듈이 이미 다루는 일반 검증 개념이라 거기서
// import해서 쓴다(중복 정의 금지).

/** 따옴표로 인용된 구절 바로 뒤(문장이 끝나는 구간 정도)에 [n] 각주가 없으면
 * 검증 없이 지어낸 인용구로 의심한다 — "책이 있다[1]"처럼 책의 존재에만 각주가
 * 붙고 정작 인용구 자체엔 각주가 없는 경우가 실제로 있었다. 각주가 있어도 그
 * 각주가 전부 동영상/위키형 출처면 마찬가지로 미검증으로 본다(원문 대조가
 * 불가능하거나 자유 편집이라 원문 그대로라는 보장이 없음). 단, 학생이 [학생이
 * 추가로 입력한 지침]에 직접 적어준 내용(예: 친구의 실제 고민 원문)을 그대로
 * 인용한 경우는 제외한다 — 그건 검색이 필요 없는, 이미 확인된 정보라서 각주가
 * 없는 게 정상이다. */
function detectUnverifiedQuotes(sections: RawSection[], sources: SourceRef[], instructions?: string): string[] {
  const normalizedInstructions = instructions ? normalizeForCompare(instructions) : "";
  const sourceById = new Map(sources.map((s) => [s.n, s]));
  const found: string[] = [];
  for (const s of sections) {
    QUOTE_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = QUOTE_PATTERN.exec(s.content))) {
      const quoteText = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
      // 학생이 직접 준 지침(친구의 고민 원문 등)에서 그대로 따온 인용이면 스킵.
      const normalizedQuote = normalizeForCompare(quoteText);
      if (normalizedInstructions && normalizedInstructions.includes(normalizedQuote.slice(0, 15))) continue;

      const afterEnd = m.index + m[0].length;
      const trailingWindow = s.content.slice(afterEnd, afterEnd + 60);
      const citedNs = Array.from(trailingWindow.matchAll(/\[(\d+)\]/g), (mm) => Number(mm[1]));
      const hasTrustworthyCitation = citedNs.some((n) => {
        const src = sourceById.get(n);
        return src && !isWeakQuoteSource(src.url);
      });
      if (!hasTrustworthyCitation || looksLikeMarketingCopy(quoteText)) {
        found.push(`${s.label}: "${quoteText.slice(0, 25)}${quoteText.length > 25 ? "..." : ""}"`);
      }
    }
  }
  return found;
}

// 책 제목은 겹낫표(《》/『』)로 감싸 쓰기도 하고, 부호 없이 "책 제목: X"처럼도
// 쓴다 — 실제 테스트에서 후자가 더 흔했다. 이 정규식은 s.citedBook(구조화
// 필드)이 비어있을 때만 쓰는 보조 수단이고, 정상 경로는 citedBook을 우선한다.

/** 이 섹션이 책을 언급했는지 구조화 필드(citedBook) 우선, 없으면 겹낫표
 * 정규식으로 최선을 다해 판단한다. */
function mentionedBookTitle(s: RawSection): string | undefined {
  if (s.citedBook?.title) return s.citedBook.title;
  const m = s.content.match(BOOK_TITLE_PATTERN);
  return m ? m[0].slice(1, -1) : undefined;
}

function detectUncitedBookMentions(sections: RawSection[]): string[] {
  const found: string[] = [];
  for (const s of sections) {
    const title = mentionedBookTitle(s);
    if (title && !/\[\d+\]/.test(s.content)) {
      found.push(`${s.label}: ${title}`);
    }
  }
  return found;
}

/** 책 제목을 언급한 섹션인데, 그 섹션에 실제로 인용된 출처가 전부 동영상
 * 플랫폼뿐인 경우를 잡는다 — 서지정보 자체는 위키/게시판 형태와 달리 기계적
 * 구조 판별이 안 되므로(유튜브 자막도 "책 제목+저자+출판사" 텍스트를 담을 수
 * 있다), 도메인으로 동영상 여부만 판별하고 "서지정보 갖춘 페이지가 후보에
 * 있었는데도 유튜브만 채택됐는지"는 이 결과와 함께 남기는 후보 청크 로그로
 * 사람이 대조한다. */
function detectSoleVideoSourceBookMentions(sections: RawSection[], sources: SourceRef[]): string[] {
  const found: string[] = [];
  for (const s of sections) {
    const title = mentionedBookTitle(s);
    if (!title) continue;
    const cited = sourcesCitedIn(s.content, sources);
    if (cited.length > 0 && cited.every((src) => isVideoPlatformUrl(src.url))) {
      found.push(`${s.label}: ${title} (출처: ${cited.map((c) => c.url).join(", ")})`);
    }
  }
  return found;
}

/** 이 섹션에 "따옴표로 직접 인용 + 동영상/위키/블로그가 아닌 각주 + 마케팅
 * 카피가 아닌 문장"이 이미 있는지 확인한다 — 있으면 이미 제대로 검증된
 * 것이므로 verifyExcerpt()를 또 돌릴 필요가 없다. 출처 도메인이 신뢰
 * 가능해도 인용된 문장 자체가 서점의 저자·책 소개 카피(마케팅 문구)면
 * "검증됐다"고 간주하지 않는다 — 실제로 발견된 버그(도메인은 정상인데
 * 인용 내용이 책 본문이 아니었던 사례). */
function hasVerifiedDirectQuote(content: string, sources: SourceRef[]): boolean {
  const sourceById = new Map(sources.map((s) => [s.n, s]));
  QUOTE_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = QUOTE_PATTERN.exec(content))) {
    const quoteText = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
    if (looksLikeMarketingCopy(quoteText)) continue;
    const afterEnd = m.index + m[0].length;
    const trailingWindow = content.slice(afterEnd, afterEnd + 60);
    const citedNs = Array.from(trailingWindow.matchAll(/\[(\d+)\]/g), (mm) => Number(mm[1]));
    if (citedNs.some((n) => { const src = sourceById.get(n); return src && !isWeakQuoteSource(src.url); })) {
      return true;
    }
  }
  return false;
}

interface BookMention {
  label: string;
  title: string;
  author?: string;
  /** 이미 인용부호로 쓰인 후보 문장이 있으면(각주가 없거나 동영상/위키뿐이라
   * 미검증인 상태) 그 문장을 검증 대상으로 넘긴다 — 없으면 verifyExcerpt()가
   * 개방형 검색("아무 원문이나 노출된 걸 찾아줘")으로 대신 시도한다. */
  candidateQuote?: string;
}

/** 책 제목을 언급했는데 아직 "검증된 직접 인용"이 없는 섹션을 모두 찾는다 —
 * 인용구가 아예 없는(패러프레이즈만 있는) 경우도 포함한다. 이 목록에 걸린
 * 항목은 generateEssay()가 verifyExcerpt()로 별도 검증을 시도해서, 성공하면
 * 확인된 원문으로 업그레이드를 시도한다(검색 성공률을 실제로 높이는 부분).
 * 책 감지는 s.citedBook(구조화 필드, stage B가 같은 호출에서 함께 뽑아준다)을
 * 우선 쓴다 — 겹낫표 정규식만 쓰면 모델이 부호 없이 "책 제목: X"처럼 쓰는
 * 경우(실제로 더 흔했다)를 놓친다. */
function extractBookMentionsNeedingVerification(sections: RawSection[], sources: SourceRef[], quoteOnlyFromText = false): BookMention[] {
  const found: BookMention[] = [];
  for (const s of sections) {
    const title = mentionedBookTitle(s);
    if (!title) continue;
    if (hasVerifiedDirectQuote(s.content, sources)) continue;

    QUOTE_PATTERN.lastIndex = 0;
    const quoteMatch = QUOTE_PATTERN.exec(s.content);
    const regexQuote = quoteMatch ? quoteMatch[1] ?? quoteMatch[2] ?? quoteMatch[3] ?? quoteMatch[4] : undefined;

    // 책 과제가 아니면(인물 탐구 중 지나가며 책을 언급) 단계 분리 모델이 뽑은 quote를 믿지 않는다 — 신문 헤드라인을 책 구절로 오인해 약 100초의 검증이 돌았다(실측).
    let candidateQuote = quoteOnlyFromText ? regexQuote : s.citedBook?.quote || regexQuote;
    // 같은 모델이 책 제목(또는 그 일부)을 "인상 깊은 구절"로 뽑는 일도 있다(실측: 처방 도서 줄의 제목이 확정 인용문으로 바뀜) — 제목과 같은 문구는 구절이 아니다.
    if (candidateQuote && normalizeForCompare(title).includes(normalizeForCompare(candidateQuote))) candidateQuote = undefined;
    found.push({ label: s.label, title, author: s.citedBook?.author, candidateQuote });
  }
  return found;
}

/**
 * 실제로 발견된 버그: 이미 "검증된 직접 인용"이 있는 책(예: 각주까지 정상
 * 붙은 경우)은 extractBookMentionsNeedingVerification()의 대상에서 아예
 * 빠지는데, "인용구가 검증됨"과 "저자명이 정확함"은 서로 다른 사실이다 —
 * 인용구는 진짜 원문이 노출된 페이지에서 확인됐어도, 그 책의 저자를 studed가
 * 완전히 다른 이름으로 잘못 표기했을 수 있다(실제 사례: 『내가 원하는 것을
 * 나도 모를 때』를 "김나이" 저작으로 표기 — 실제 저자는 전승환). 그래서 저자
 * 대조는 인용구 검증 여부와 무관하게, 언급된 책 전부(중복 제거)를 대상으로
 * 별도로 돈다.
 */
function extractDistinctBookMentions(sections: RawSection[]): { title: string; author?: string }[] {
  const seen = new Map<string, { title: string; author?: string }>();
  for (const s of sections) {
    const title = mentionedBookTitle(s);
    if (!title) continue;
    const key = normalizeBookTitleKey(title);
    const existing = seen.get(key);
    if (existing) {
      if (!existing.author && s.citedBook?.author) existing.author = s.citedBook.author;
      continue;
    }
    seen.set(key, { title, author: s.citedBook?.author });
  }
  return Array.from(seen.values());
}

/**
 * summary_lines에 등장하는 겹낫표/책곁표(《》/『』) 감싼 책 제목을 본문에서
 * 확정된 canonicalTitle로 통일한다 — 이미 canonicalTitle과 같은 제목이면
 * 건드리지 않는다. 순수 문자열 치환이라 겹낫표로 감싸이지 않은(부호 없는)
 * 제목 언급까지는 못 잡지만, 실제로 보고된 사고 사례(요약과 본문 둘 다
 * 겹낫표를 썼는데 내용이 달랐던 경우)를 정확히 커버한다.
 */
function unifyBookTitleInSummary(summaryLines: string[], canonicalTitle: string): { summaryLines: string[]; changedCount: number } {
  let changedCount = 0;
  const newLines = summaryLines.map((line) => {
    return line.replace(/(《|『)([^》』]{2,60})(》|』)/g, (match, open: string, inner: string, close: string) => {
      if (normalizeBookTitleKey(inner) === normalizeBookTitleKey(canonicalTitle)) return match;
      changedCount++;
      return `${open}${canonicalTitle}${close}`;
    });
  });
  return { summaryLines: newLines, changedCount };
}

/** 본문에서 첫 번째 따옴표 인용구를 찾고, 그 위치와 바로 뒤 각주의 신뢰도까지
 * 함께 반환한다 — applyCanonicalQuotes()가 "이 섹션에 이미 어떤 인용구가
 * 있는지"를 확인하고 교체할 위치를 찾는 데 쓴다. */
function findQuoteOccurrence(
  content: string,
  sources: SourceRef[],
  bookTitle?: string
): { quoteText: string; matchStart: number; matchEnd: number; hasTrustworthyCitation: boolean } | undefined {
  const sourceById = new Map(sources.map((s) => [s.n, s]));
  QUOTE_PATTERN.lastIndex = 0;
  let m = QUOTE_PATTERN.exec(content);
  // 책 제목을 따옴표로 감싸 쓴 경우(실측: 처방 도서 줄의 "책 제목")는 인용구가 아니다 — 건너뛰고 다음 따옴표를 본다.
  while (m && bookTitle && normalizeForCompare(bookTitle).includes(normalizeForCompare(m[1] ?? m[2] ?? m[3] ?? m[4] ?? ""))) m = QUOTE_PATTERN.exec(content);
  if (!m) return undefined;
  const quoteText = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
  const afterEnd = m.index + m[0].length;
  const trailingWindow = content.slice(afterEnd, afterEnd + 60);
  const citedNs = Array.from(trailingWindow.matchAll(/\[(\d+)\]/g), (mm) => Number(mm[1]));
  const hasTrustworthyCitation =
    citedNs.some((n) => {
      const src = sourceById.get(n);
      return src && !isWeakQuoteSource(src.url);
    }) && !looksLikeMarketingCopy(quoteText);
  return { quoteText, matchStart: m.index, matchEnd: afterEnd, hasTrustworthyCitation };
}

/**
 * "단일 진실 소스" 원칙을 인용구에도 강제한다 — 실제로 발견된 버그: 같은 책의
 * "인상 깊은 구절"이 책처방전/편지 섹션마다 서로 다른 문장으로 나온 적이
 * 있었다(둘 다 각주가 붙어 있어도 실제로는 둘 다 근거 없는 문장이었다 —
 * 『체리새우: 비밀글입니다』 사례). 재시도 프롬프트로 "모든 단계에서 동일한
 * 문장을 쓰라"고 지시해도 모델이 100% 따른다는 보장이 없다는 게 이 프로젝트에서
 * 반복 확인된 패턴이라, 위에서 이미 verifyExcerpt()로 확정해둔 결과
 * (quoteVerificationByTitle — 검색 재호출 없음)를 그 책을 언급하는 모든
 * 섹션에 기계적으로 동일하게 적용해서 확실히 통일한다. 이미 인용구가 없는
 * (패러프레이즈만 쓴) 섹션은 건드리지 않는다 — 없던 인용구를 기계적으로 문장
 * 중간에 새로 삽입하면 어색해질 위험이 있어서다.
 */
async function applyCanonicalQuotes(
  sections: RawSection[],
  sources: SourceRef[],
  quoteVerificationByTitle: Map<string, VerificationResult>
): Promise<{ sections: RawSection[]; sources: SourceRef[] }> {
  if (quoteVerificationByTitle.size === 0) return { sections, sources };
  let newSources = sources;

  // 실제로 발견된 버그: 여기서 새로 추가하는 출처만 url_valid를 null로
  // 남겨뒀더니, 그 출처만 화면에서 "(연결 확인됨)" 표시가 빠졌다(다른
  // 출처는 전부 generateOnce()의 validateSources()를 거쳐서 true/false가
  // 채워지는데, 이 출처는 그 시점 이후에 추가돼서 검증을 한 번도 안 거쳤음).
  // 본문에 실제로 넣기 전에 여기서도 똑같이 N6 검증(HTTP 상태 확인)을 거친다.
  for (const result of quoteVerificationByTitle.values()) {
    if (!(result.verified && result.confirmedExcerpt && result.source)) continue;
    if (newSources.some((src) => src.url === result.source!.url)) continue;
    const n = newSources.length > 0 ? Math.max(...newSources.map((src) => src.n)) + 1 : 1;
    const [validated] = await validateSources([{ n, title: result.source.title, url: result.source.url, url_valid: null }]);
    newSources = [...newSources, validated];
  }

  const newSections = sections.map((s) => {
    const title = mentionedBookTitle(s);
    if (!title) return s;
    const result = quoteVerificationByTitle.get(normalizeBookTitleKey(title));
    if (!result) return s;

    const occ = findQuoteOccurrence(s.content, newSources, title);
    if (!occ) return s;

    const before = s.content.slice(0, occ.matchStart);
    const afterTrimmed = s.content.slice(occ.matchEnd).replace(/^(\s*\[\d+\])+/, "");

    if (result.verified && result.confirmedExcerpt && result.source) {
      // 필요한 출처는 위에서 이미 검증까지 마쳐서 newSources에 넣어뒀다 —
      // 여기서는 그 번호(n)만 찾아 쓴다(못 찾는 건 이론상 일어나지 않지만,
      // 방어적으로 이 섹션은 건드리지 않고 넘어간다).
      const n = newSources.find((src) => src.url === result.source!.url)?.n;
      if (n === undefined) return s;
      if (normalizeForCompare(occ.quoteText) === normalizeForCompare(result.confirmedExcerpt) && occ.hasTrustworthyCitation) {
        return s; // 이미 통일돼 있음
      }
      console.warn(`[generateEssay] 인용구 통일: label="${s.label}" title="${title}" → 확정된 문장으로 교체`);
      return { ...s, content: `${before}"${result.confirmedExcerpt}"[${n}]${afterTrimmed}` };
    }

    // 따옴표만 삭제하면 "…던졌다.라며"처럼 문장부호·조사가 남는다 — 인용문과 뒤따르는 인용 조사를 함께 재구성한다.
    const rw = rewriteUnquoted(occ.quoteText, afterTrimmed);
    const rebuilt = `${before}${rw.text}${afterTrimmed.slice(rw.consumed)}`;
    if (rw.uncertain || findQuoteResidue(rebuilt.slice(Math.max(0, before.length - 40), before.length + rw.text.length + 60)).length > 0) {
      console.warn(`[generateEssay] 인용구 통일: label="${s.label}" title="${title}" → 검증 실패지만 문법적으로 안전하게 바꿀 수 없어 따옴표 유지`);
      return s;
    }
    console.warn(`[generateEssay] 인용구 통일: label="${s.label}" title="${title}" → 검증 실패, 따옴표 제거`);
    return { ...s, content: rebuilt };
  });

  return { sections: newSections, sources: newSources };
}

/**
 * 최종 안전장치 — 검색/재시도로도 "따옴표로 직접 인용했는데 출처가 없거나
 * 약함(동영상/위키)"인 상태가 남으면, 모델에게 또 묻지 않고 코드가 기계적으로
 * 그 따옴표만 벗겨낸다. 재시도를 아무리 잘 설계해도(각도를 바꿔가며 여러 번
 * 시도해도) 검색 그라운딩 자체가 확률적이라 100%를 프롬프트만으로 보장할 수
 * 없다는 게 이미 여러 라운드에 걸쳐 확인됐다 — 그래서 "따옴표 있음 + 약한/무
 * 출처"라는 모순 상태 자체를 이 함수가 구조적으로 불가능하게 만든다. 따옴표만
 * 벗기고 문장 내용과 조사(예: "~라고 말한다")는 그대로 둔다 — 한국어는 인용
 * 부호 없이도 "~라고" 같은 조사로 인용 여부가 자연스럽게 읽히므로 문장이
 * 어색해지지 않는다. 각주 번호 자체는 건드리지 않는다(그 출처가 책 존재
 * 확인 등 다른 문장의 근거로는 여전히 정당할 수 있어서 — 이 함수는 오직
 * "따옴표를 쓸 자격이 있는가"만 판단한다).
 */
export function stripWeaklySourcedQuotes(
  sections: RawSection[],
  sources: SourceRef[]
): { sections: RawSection[]; strippedCount: number } {
  const sourceById = new Map(sources.map((s) => [s.n, s]));
  let strippedCount = 0;

  const newSections = sections.map((s) => {
    const original = s.content;
    // 따옴표만 벗기면 "…던졌다.라며"처럼 문장부호·조사가 남는다 — 정리는 quote-cleanup.ts의 stripQuotesWhere가 맡는다.
    const result = stripQuotesWhere(
      original,
      QUOTE_PATTERN,
      (quoteText, afterEnd) => {
        const trailingWindow = original.slice(afterEnd, afterEnd + 60);
        const citedNs = Array.from(trailingWindow.matchAll(/\[(\d+)\]/g), (mm) => Number(mm[1]));
        // 출처 인용을 내세우지 않는 따옴표(학생 속마음·대화·부모님 말씀)는 원문 인용이 아니다 — 실측(2026-10-22): 고민 쓰기의 "나만 없는 것 같다"까지 따옴표가 벗겨졌다.
        if (qualityFixesOn() && citedNs.length === 0) {
          const start = original.lastIndexOf(quoteText, afterEnd);
          const before = original.slice(Math.max(0, start - 40), Math.max(0, start));
          if (!/구절|문장|책에서|책은|책에는|작가|저자|원문|라고\s*썼|인용/.test(before)) return false;
        }
        const hasTrustworthyCitation = citedNs.some((n) => {
          const src = sourceById.get(n);
          return src && !isWeakQuoteSource(src.url);
        });
        return !(hasTrustworthyCitation && !looksLikeMarketingCopy(quoteText));
      },
      (quoteText) =>
        console.warn(`[generateEssay] 최종 안전장치: 인용구를 문법적으로 안전하게 바꿀 수 없어 따옴표 유지 label="${s.label}" quote="${quoteText.slice(0, 40)}"`),
      (quoteText) =>
        console.warn(
          `[generateEssay] 최종 안전장치: ${looksLikeMarketingCopy(quoteText) ? "저자 소개/마케팅 카피" : "약한/무 출처"} 인용구의 따옴표를 강제로 제거함 label="${s.label}" quote="${quoteText.slice(0, 40)}"`
        )
    );
    strippedCount += result.strippedCount;
    return result.content === original ? s : { ...s, content: result.content };
  });

  return { sections: newSections, strippedCount };
}

// generate-plan.ts에서 "PPT 템플릿 찾기"처럼 사실 인용이 아닌 순수 실행 단계
//까지 검증 대상으로 잡던 오탐을 고칠 때 쓴 것과 같은 종류의 판별 — 통계·
// 정의·전문용어처럼 실제로 외부 검증이 필요한 사실 주장에만 각주를 허용하고,
// 감정·상황 묘사 같은 순수 서술에는 각주를 붙이지 않는다.
// 10종 수행평가 교차 테스트(2026-09-13)에서 발견된 문제: 역사 탐구(산업혁명)
// 에세이가 "하루 14시간이 넘는 장시간 노동", "러다이트 운동", "차티스트 운동",
// "공장법" 같은 구체적 역사적 사실을 각주 하나 없이 썼는데도, 기존 패턴이
// "통계/수치/%/연구" 같은 키워드만 봐서 noSourcesWarning이 안 뜬 사례가 있었다.
// 연도·세기·특정 수량·최초/유일 표현도 검증이 필요한 구체적 사실 주장이므로 추가.
// 방정환 결과물 감사(2026-09-14)에서 사용자가 추가로 요구한 검증 대상 표현
// ("제정했다"/"창간했다"/"설립했다"/"~로 이어졌다" 등) — 최초/유일급의 절대적
// 표현(UNSUPPORTED_SUPERLATIVE_PATTERN, 미검증 시 문장 통째로 제거)보다는
// 위험도가 낮은 일반 사실 서술 동사라, 여기(noSourcesWarning 트리거)에만
// 추가한다 — 문장을 지우지 않고 "검증 안 됨" 배너만 띄우는 수준.
// 라에네크 결과물 감사(2026-09-16)에서 추가 요구된 표현("발명"/"창립"/
// "수호했다"/"~의 원인이 되었다") — 특히 "환자의 생명권을 수호했다"처럼
// 실제 업적(발명)을 과제 주제(인권)에 맞춰 해석까지 확장하는 문장이 각주
// 없이 나온 사례가 실제로 발견되어 추가함.
// FACTUAL_CLAIM_HINT_PATTERN은 essay/verifiable-claims.ts로 옮겼다(위 설명은 그대로 이 규칙의 이력이다).

/** [n] 각주 바로 앞의 "그 문장"만 잘라낸다 — 문장부호(. ! ? 개행)를 기준으로
 * 역방향 탐색. 완벽한 문장 분리기는 아니지만, 각주 바로 앞 절 정도의 맥락을
 * 보는 용도로는 충분하다(다른 기계적 검사들과 같은 수준의 근사치). */
function sentenceBefore(content: string, matchIndex: number): string {
  const before = content.slice(0, matchIndex);
  const start = Math.max(before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"), before.lastIndexOf("\n"));
  return content.slice(start + 1, matchIndex);
}

/**
 * 실제로 관찰된 오탐 — "내 친구는 먹어도 먹어도 살이 안 찌는 체질이라
 * 은근히 스트레스를 받는다 [4]"처럼, 학생 본인/친구의 감정·상황을 서술하는
 * 문장(외부 검증이 필요 없는 narrative)에 검색 각주가 붙는 경우가 있었다.
 * CITATION_JUDGMENT_RULE(프롬프트)이 이미 "주관적 문장에는 검색 결과를
 * 억지로 연결하지 말라"고 지시하지만, 이 프로젝트에서 반복 확인된 패턴대로
 * 프롬프트 지시만으로는 100% 안 지켜진다 — 그래서 기계적으로 마지막 안전장치를
 * 둔다. 책을 언급한 섹션(책 처방전/편지)은 정당한 각주가 많으므로 건드리지
 * 않고, 그 외 섹션에서 각주 바로 앞 문장에 사실 주장을 암시하는 단어가 전혀
 * 없으면 그 각주 표시만 제거한다(문장 내용은 그대로 둠 — stripWeaklySourcedQuotes
 * 와 같은 "표시만 벗기고 내용은 보존" 방식).
 */
/** [n] 각주 바로 앞 문장에 FACTUAL_CLAIM_HINT_PATTERN이 없으면 그 각주 표시만
 * 지운다(문장 내용은 보존) — stripUnjustifiedNarrativeCitations(섹션 본문)와
 * stripUnjustifiedSummaryCitations(summary_lines) 양쪽이 공유하는 핵심 로직. */
function stripUnjustifiedCitationsFromText(text: string): { text: string; strippedCount: number } {
  let strippedCount = 0;
  const newText = text.replace(/\[(\d+)\]/g, (match, _numStr, offset: number) => {
    const sentence = sentenceBefore(text, offset);
    if (FACTUAL_CLAIM_HINT_PATTERN.test(sentence)) return match;
    strippedCount++;
    return "";
  });
  return { text: newText, strippedCount };
}

function stripUnjustifiedNarrativeCitations(sections: RawSection[]): { sections: RawSection[]; strippedCount: number } {
  let strippedCount = 0;
  const newSections = sections.map((s) => {
    if (mentionedBookTitle(s)) return s; // 책 관련 각주는 정당한 경우가 많아 건드리지 않음
    // 항목별 조사 자료("### 항목명" + 사실 불릿)는 줄마다 검증된 사실이라, 연도·수치
    // 같은 힌트 단어가 없는 짧은 사실 줄(예: "- 출생: 미국 조지아주 애틀랜타")의
    // 정당한 각주까지 지워버리면 항목별 출처 연결이 깨진다.
    if (s.requiredItems) return s;
    const { text: newContent, strippedCount: n } = stripUnjustifiedCitationsFromText(s.content);
    if (n === 0) return s;
    strippedCount += n;
    console.warn(`[generateEssay] 최종 안전장치: 사실 검증이 필요 없는 서술 문장의 불필요한 각주를 제거함 label="${s.label}"`);
    return { ...s, content: newContent };
  });
  return { sections: newSections, strippedCount };
}

/** summary_lines(전체 요약 불릿)도 같은 오탐(학생의 분석/의견 문장에 검색
 * 각주가 붙는 것)에서 자유롭지 않다 — 위 stripUnjustifiedNarrativeCitations는
 * RawSection(섹션 본문)만 순회해서 summary_lines(문자열 배열)는 거치지 않았다.
 * 책 관련 예외(mentionedBookTitle 스킵)는 summary_lines엔 적용하지 않는다 —
 * 요약 불릿은 본문처럼 실제 인용구를 담는 자리가 아니라 순수 요약이라서다. */
function stripUnjustifiedSummaryCitations(summaryLines: string[]): { summaryLines: string[]; strippedCount: number } {
  let strippedCount = 0;
  const newLines = summaryLines.map((line) => {
    const { text, strippedCount: n } = stripUnjustifiedCitationsFromText(line);
    if (n === 0) return line;
    strippedCount += n;
    return text;
  });
  if (strippedCount > 0) {
    console.warn(`[generateEssay] 최종 안전장치: 전체 요약(summary_lines)의 불필요한 각주 ${strippedCount}건 제거함`);
  }
  return { summaryLines: newLines, strippedCount };
}

// 10종 수행평가 교차 테스트(2026-09-13)에서 발견된 버그: 사회문제 탐구
// 에세이가 실제 검색 그라운딩이 하나도 없었는데도(sources=[]) 본문 맨 끝에
// "출처:\n- 한국언론진흥재단 미디어 통계 자료\n- 보건복지부 청소년 건강
// 행태 조사 보고서"처럼 그럴듯해 보이는 참고문헌 목록을 스스로 지어내
// 붙였다. noSourcesWarning 배너는 정상적으로 떴지만, 학생이 배너를 못 보고
// 이 목록만 보면 실제로 검증된 출처처럼 오해할 수 있다 — "출처가 존재한다"
// 와 "출처가 그 주장을 뒷받침한다"는 다르다는 원칙을 이 경우에도 적용해서,
// 검증(실제 [n] 각주)이 전혀 없는데 "출처:"류 헤더로 시작하는 자기 생성
// 목록은 제거한다.
const FAKE_REFERENCE_LIST_PATTERN = /^[ \t]*(출처|참고\s*문헌|참고\s*자료|References?)[ \t]*[:：][ \t]*$/m;

/** content 전체에 실제 [n] 각주가 하나도 없는데(=진짜 검증된 것이 없는데)
 * "출처:"/"참고문헌:" 같은 자기 생성 헤더 줄이 있으면, 그 줄부터 끝까지
 * 잘라낸다. 실제 각주가 있으면(다른 문제일 수 있어도) 건드리지 않는다. */
export function stripFakeReferenceList(content: string): { content: string; stripped: boolean } {
  if (/\[\d+\]/.test(content)) return { content, stripped: false };
  const m = FAKE_REFERENCE_LIST_PATTERN.exec(content);
  if (!m) return { content, stripped: false };
  const newContent = content.slice(0, m.index).trim();
  if (newContent.length < 10) return { content, stripped: false };
  return { content: newContent, stripped: true };
}

function stripFakeReferenceListFromSections(
  sections: RawSection[]
): { sections: RawSection[]; strippedLabels: string[] } {
  const strippedLabels: string[] = [];
  const newSections = sections.map((s) => {
    const { content, stripped } = stripFakeReferenceList(s.content);
    if (!stripped) return s;
    strippedLabels.push(s.label);
    console.warn(`[generateEssay] 최종 안전장치: 미검증 자기 생성 참고문헌 목록 제거함 label="${s.label}"`);
    return { ...s, content };
  });
  return { sections: newSections, strippedLabels };
}

/**
 * 실제로 발견된 버그: 순수 격려/감상만 담긴 편지 섹션(책 언급도, 직접
 * 인용도, 통계 같은 사실 주장도 전혀 없음)에 "이 내용은 검색으로
 * 검증되지 않았어요" 경고 배너가 떴다 — ResultPanel.tsx의
 * NoSourcesWarning이 "출처가 0개인가"만 보고 "애초에 검증할 대상이
 * 있었는가"는 확인하지 않았기 때문이다. 이 함수는 그 판별을 이 파일이
 * 이미 "인용/각주가 정당한가"를 판단할 때 쓰는 것과 같은 신호로 한다 —
 * 책 언급(mentionedBookTitle), 직접 인용(QUOTE_PATTERN), 통계/전문용어
 * 등 사실 주장 힌트(FACTUAL_CLAIM_HINT_PATTERN) 중 하나라도 있으면
 * "검증이 필요한 사실 주장이 있다"고 본다.
 */
function sectionHasVerifiableClaim(s: RawSection, sceneList = false): boolean {
  if (mentionedBookTitle(s)) return true;
  return hasVerifiableClaimText(s.content, { sceneList });
}

/** 문서 전체에서 공유되는 원래 번호([4]부터 시작하는 식) 대신, 각 섹션이
 * 실제로 인용한 번호만 등장 순서대로 1부터 다시 매긴다 — 학생 입장에서
 * "왜 이 단계는 4번부터 시작하지?"처럼 혼란스러운 걸 막기 위함. */
function renumberSectionCitations(content: string, allSources: SourceRef[]): { content: string; sources: SourceRef[] } {
  const sourceByN = new Map(allSources.map((s) => [s.n, s]));
  const oldToNew = new Map<number, number>();
  let nextN = 1;
  const newContent = content.replace(/\[(\d+)\]/g, (match, numStr: string) => {
    const oldN = Number(numStr);
    if (!sourceByN.has(oldN)) return ""; // 출처 목록에 없는 번호는 남기지 않는다(눌러 볼 근거가 없는 각주)
    let newN = oldToNew.get(oldN);
    if (newN === undefined) {
      newN = nextN++;
      oldToNew.set(oldN, newN);
    }
    return `[${newN}]`;
  });
  const newSources0 = Array.from(oldToNew.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([oldN, newN]) => ({ ...sourceByN.get(oldN)!, n: newN }));
  return { content: dedupeAdjacentMarkers(newContent), sources: newSources0 };
}

// 분량 준수(예: "800자 내외 ±50자")는 프롬프트 문구를 아무리 강하게 써도
// 모델이 자기 글자수를 정확히 세지 못한다는 게 실제 테스트로 확인됐다(2회
// 모두 목표의 75~77%만 채움). 인용구 검증과 같은 패턴 — "생성 → 코드가
// 기계적으로 글자수를 세서 확인 → 부족하면 실제 숫자를 알려주며 재시도"를
// 적용한다. min/max 중 하나가 0이면 그쪽은 제약 없음으로 취급한다.
interface LengthIssue {
  label: string;
  actual: number;
  min: number;
  max: number;
  countsSpaces: boolean;
  unit?: "chars" | "words";
}

function countChars(text: string, countsSpaces: boolean): number {
  return countsSpaces ? text.length : text.replace(/\s/g, "").length;
}

/** 영어 단어 수 — 각주 표기([1])와 마크다운 기호는 세지 않는다. */
function countWords(text: string): number {
  return (text.replace(/\[\d+\]/g, " ").match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g) ?? []).length;
}

const unitWord = (unit?: "chars" | "words") => (unit === "words" ? "단어" : "자");

function checkLengthCompliance(sections: RawSection[], elements: CoreTaskInfo["task_elements"]): LengthIssue[] {
  const issues: LengthIssue[] = [];
  for (const el of elements) {
    if (!el.target_length) continue;
    const { min, max, counts_spaces, unit } = el.target_length;
    // 2차 방어선(analyze.ts에서 이미 한 번 걸러내지만, 여기서도 유한하고
    // 현실적인 값인지 다시 확인한다) — Infinity/NaN이 새어 들어오면
    // "최소 Infinity자 이상" 같은 문구가 사용자에게 그대로 노출될 수 있다.
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0) {
      console.warn(`[generateEssay] target_length 값이 비정상적이라 분량 검사를 건너뜀 label="${el.label}" min=${min} max=${max}`);
      continue;
    }
    const section = sections.find((s) => s.label === el.label);
    if (!section) continue;
    const actual = unit === "words" ? countWords(section.content) : countChars(section.content, counts_spaces);
    const belowMin = min > 0 && actual < min;
    const aboveMax = max > 0 && actual > max;
    if (belowMin || aboveMax) {
      issues.push({ label: el.label, actual, min, max, countsSpaces: counts_spaces, unit });
    }
  }
  return issues;
}

function lengthRangeText(issue: LengthIssue): string {
  const u = unitWord(issue.unit);
  if (issue.min > 0 && issue.max > 0) return `${issue.min}~${issue.max}${u}`;
  if (issue.min > 0) return `최소 ${issue.min}${u} 이상`;
  return `최대 ${issue.max}${u} 이하`;
}

/** 재시도 프롬프트에 넣을, 실제 숫자를 담은 확장/축소 지시. 이미 쓴 내용을
 * 버리고 새로 쓰게 하지 않고 "그 위에 이어서 보완"하라고 명시하는 게 핵심 —
 * 안 그러면 재시도가 완전히 다른 내용으로 다시 써버려서 분량 문제만 해결하고
 * 다른 품질(색채 묘사 등)이 오히려 나빠질 수 있다. */
function buildLengthCorrectionMessage(issue: LengthIssue): string {
  const unit = issue.unit === "words" ? "영어 단어 수" : issue.countsSpaces ? "공백 포함" : "공백 제외";
  const uw = unitWord(issue.unit);
  const range = lengthRangeText(issue);
  if (issue.min > 0 && issue.actual < issue.min) {
    const shortfall = issue.min - issue.actual;
    return (
      `[분량 부족 재작성 지시 — 반드시 지킬 것] "${issue.label}" 단계 본문이 현재 ${issue.actual}${uw}` +
      `(${unit})인데 목표는 ${range}다. 이미 쓴 내용을 다 버리고 새로 쓰지 말고, 기존 내용을 ` +
      `그대로 유지한 채로 그 위에 세부 묘사·구체적 설명·디테일을 추가로 확장할 것 — 대략 ${shortfall}${uw} ` +
      `정도를 더 채우면 되지만, 정확히 그 숫자를 세어 맞추라는 뜻이 아니라 결과가 ${range} 범위 ` +
      `안에 자연스럽게 들어오는 게 목적이다. 너무 조금만 늘려서 여전히 범위에 못 미치지 않게 할 것.`
    );
  }
  const excess = issue.max > 0 ? issue.actual - issue.max : 0;
  return (
    `[분량 초과 재작성 지시 — 반드시 지킬 것] "${issue.label}" 단계 본문이 현재 ${issue.actual}${uw}` +
    `(${unit})인데 목표는 ${range}다. 핵심 내용과 흐름은 그대로 유지하되 불필요하게 늘어지는 표현을 ` +
    `정리할 것 — 대략 ${excess}${uw} 정도를 줄이면 되지만, 정확히 그 숫자를 세어 맞추라는 뜻이 아니라 ` +
    `결과가 ${range} 범위 안에 자연스럽게 들어오는 게 목적이다. 너무 많이 쳐내서 범위 아래로 ` +
    `내려가지 않게, 핵심 문장과 디테일은 남기고 정말 불필요한 수식어·중복 표현 위주로만 덜어낼 것.`
  );
}

/** 이 섹션 본문에 실제로 [n]으로 인용된 출처만 골라낸다 — 안 그러면 인용이 전혀
 * 없는 섹션(예: 학생 본인 서술)에도 다른 섹션의 출처 목록이 그대로 붙어버린다. */
function sourcesCitedIn(content: string, allSources: SourceRef[]): SourceRef[] {
  const cited = new Set(Array.from(content.matchAll(/\[(\d+)\]/g), (m) => Number(m[1])));
  return allSources.filter((s) => cited.has(s.n));
}

// 실제로 5개 이상의 서로 다른 고민으로 반복 테스트해서 확인된 상투구 목록.
// ANTI_AI_TONE_RULES가 이미 "너는 충분히 ~야"를 이름까지 짚어 금지하는데도
// 계속 나와서(프롬프트 지시만으론 불충분함이 실증됨), 기계적으로 잡아낸다.
const CLICHE_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: '"너는 (~) 충분히 ~"', pattern: /너는[^.!?\n]{0,15}충분히[^.!?\n]{0,25}[야니까]/ },
  {
    label: '"언제든 ~하면 나한테/내게 와/연락해/얘기해"',
    pattern: /언제든[^.!?\n]{0,15}(나한테|내게)[^.!?\n]{0,10}(와|연락|얘기|말해)/,
  },
  {
    label: '"힘내자/화이팅하자/응원할게"로 문단을 마무리',
    // 이름을 부르며 끝내는 경우("힘내자, 수현아!")까지 포함해서 잡는다 —
    // 뒤에 짧은 호칭이 붙어도 사실상 같은 상투적 마무리다.
    pattern: /(힘내자|화이팅하자|응원할게|응원할 테니까)[,!.]?\s*[가-힣]{0,4}[아야]?[!.]?\s*$/,
  },
  { label: '"너무 조급해하지 마"', pattern: /너무\s*조급[^.!?\n]{0,10}(하지\s*마|말)/ },
  // 사용자 요청(2026-09-13): 위 항목들은 편지·조언형 글의 상투구인데, 인물/
  // 역사 탐구형 글(신문 기사, 위인 소개 등)에는 다른 종류의 AI 번역체
  // 클리셰(거창한 서술체)가 반복된다는 지적을 받아 추가함.
  { label: '"기틀을 마련했다"', pattern: /기틀을\s*마련했다/ },
  { label: '"결정적 계기가/를 마련/되었다"', pattern: /결정적\s*계기(를|가)\s*(마련했다|되었다)/ },
  { label: '"지대한 영향을 미쳤다"', pattern: /지대한\s*영향을\s*미쳤다/ },
  { label: '"역사적 의미가 크다"', pattern: /역사적\s*의미가\s*크다/ },
  { label: '"보편적 가치를 제시했다"', pattern: /보편적\s*가치를\s*제시했다/ },
  { label: '"(명료한/깊은) 교훈을 던진다"', pattern: /(?:명료한|큰|깊은)?\s*교훈을\s*던진다/ },
  { label: '"깊은 울림을 준다"', pattern: /깊은\s*울림을\s*준다/ },
  // 실제 10주제 교차 테스트(2026-09-13)에서 "향해 걸어갔다" 정확히 일치하는
  // 대신 "향했던"/"향해"처럼 활용형만 바꿔 같은 클리셰가 새어나간 사례가
  // 발견되어, 활용형에 안 흔들리도록 "가장 낮은 곳" 자체로 넓혔다.
  { label: '"가장 낮은 곳(을 향해)"', pattern: /가장\s*낮은\s*곳/ },
  { label: '"작은 물결이 되었다"', pattern: /작은\s*물결이\s*되었다/ },
  { label: '"시대를 관통하는"', pattern: /시대를\s*관통하는/ },
  { label: '"단순히 ~에 그치지 않고"', pattern: /단순히[^.!?\n]{0,20}그치지\s*않고/ },
  { label: '"~을 온몸으로 증명했다"', pattern: /온몸으로\s*증명했다/ },
  // 같은 테스트에서 "지평을 열었다" 정확 일치 대신 "지평 뒤에는"처럼 다른
  // 서술로 같은 클리셰가 새어나간 사례가 발견되어 함께 넓혔다.
  { label: '"(~의) 지평"', pattern: /지평(을|이)?[^.!?\n]{0,10}(열었다|넓혔다|넓히|확장|뒤에는|앞에서)/ },
];

// 사용자 요청(2026-09-13): "'최초'/'유일'/'결정적' 등은 출처에서 실제로 그렇게
// 표현하거나 충분한 근거가 있을 때만 사용" — 근거(각주)가 문장 안에 없는데도
// 이런 절대적 표현을 쓰면 과장/환각 위험이 크다. "온몸으로 증명했다"류와 달리
// 이건 "표현 자체가 나쁜 것"이 아니라 "근거 없이 쓰면 위험한 것"이라 CLICHE_
// PATTERNS(단순 문자열 매치)와 분리해서, 그 문장에 각주([n])가 있는지까지
// 함께 확인하는 별도 검사로 둔다.
// 10주제 교차 테스트(2026-09-13)에서 말랄라 유사프자이 사례("역대 최연소의
// 나이로 노벨평화상을 수상")에 각주가 없는 경우가 실제로 발견되어 추가함
// — 이 경우는 사실 자체는 맞았지만(검증 결과 확인됨), 근거 없이 단정하는
// 습관 자체를 줄이려는 목적이라 사실 여부와 무관하게 각주를 요구한다.
// 방정환 결과물 감사(2026-09-14)에서 "어린이 개념 창시"라는 각주 없는 과장
// 표현이 실제로 발견됨 — 검색 결과 "개념을 만들었다"가 아니라 "용어를
// 처음 사용하기 시작했다"가 더 정확한 서술이라는 게 확인되어 "창시"도 추가.
const UNSUPPORTED_SUPERLATIVE_PATTERN =
  /(세계\s*최초|국내\s*최초|사상\s*최초|역사상\s*최초|최초로|유일하게|유일한|결정적인?\s*(계기|원인|영향)|역대\s*최연소|가장\s*어린|창시)/;

/** 매치를 포함하는 문장 전체에서 각주([n]) 없이 절대적 표현이 쓰인 경우만
 * 골라 [시작,끝) 범위를 반환한다(각주가 있으면 근거가 있다고 보고 통과). */
function findUnsupportedSuperlativeSentences(content: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  const re = new RegExp(UNSUPPORTED_SUPERLATIVE_PATTERN.source, "g");
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const { start, end } = sentenceBoundsAround(content, m.index, m.index + m[0].length);
    const key = `${start}-${end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!/\[\d+\]/.test(content.slice(start, end))) ranges.push({ start, end });
  }
  return ranges;
}

function hasUnsupportedSuperlative(content: string): boolean {
  return findUnsupportedSuperlativeSentences(content).length > 0;
}

/** 최종 안전망 — 재시도 후에도 근거 없는 절대적 표현("최초로", "유일하게" 등)이
 * 남으면, stripCliches()와 같은 철학으로 그 문장을 통째로 제거한다. */
export function stripUnsupportedSuperlatives(content: string): { content: string; strippedCount: number } {
  const ranges = findUnsupportedSuperlativeSentences(content);
  if (ranges.length === 0) return { content, strippedCount: 0 };
  let result = content;
  let strippedCount = 0;
  for (const { start, end } of [...ranges].sort((a, b) => b.start - a.start)) {
    const removed = result.slice(0, start) + result.slice(end);
    if (removed.trim().length < 10) continue; // 문단 전체가 이 문장뿐이면 남긴다.
    result = removed;
    strippedCount++;
  }
  result = result.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (strippedCount > 0) {
    console.warn(`[generateEssay] 최종 안전장치: 근거 없는 절대적 표현(최초/유일 등) 문장 ${strippedCount}건 제거함`);
  }
  return { content: result, strippedCount };
}

function stripUnsupportedSuperlativesFromSections(
  sections: RawSection[]
): { sections: RawSection[]; strippedCount: number } {
  let total = 0;
  const newSections = sections.map((s) => {
    const { content, strippedCount } = stripUnsupportedSuperlatives(s.content);
    total += strippedCount;
    return strippedCount > 0 ? { ...s, content } : s;
  });
  return { sections: newSections, strippedCount: total };
}

function detectUnsupportedSuperlatives(sections: RawSection[]): string[] {
  return sections.filter((s) => hasUnsupportedSuperlative(s.content)).map((s) => s.label);
}

function detectCliches(sections: RawSection[]): string[] {
  const found = new Set<string>();
  for (const s of sections) {
    const trimmed = s.content.trim();
    for (const { label, pattern } of CLICHE_PATTERNS) {
      if (pattern.test(trimmed)) found.add(label);
    }
  }
  return Array.from(found);
}

/** 매치 지점을 포함하는 "문장 전체"의 [시작, 끝) 범위를 찾는다 — 마침표/
 * 느낌표/물음표/개행을 문장 경계로 본다(끝 경계는 그 문장부호까지 포함해서
 * 자른다). sentenceBefore()가 매치 "앞" 문맥만 보는 것과 달리, 이 함수는
 * 매치를 포함하는 문장 전체 범위를 구해서 통째로 제거하는 데 쓴다. */
function sentenceBoundsAround(content: string, matchStart: number, matchEnd: number): { start: number; end: number } {
  const before = content.slice(0, matchStart);
  const start = Math.max(before.lastIndexOf("."), before.lastIndexOf("!"), before.lastIndexOf("?"), before.lastIndexOf("\n")) + 1;
  const rest = content.slice(matchEnd);
  const relativeEnd = rest.search(/[.!?\n]/);
  const end = relativeEnd === -1 ? content.length : matchEnd + relativeEnd + 1;
  return { start, end };
}

/** 패턴에 매치되는 문장을 통째로 한 번 제거한다(못 찾으면 그대로 반환). */
function removeSentenceMatching(content: string, pattern: RegExp): { content: string; removed: boolean } {
  const re = new RegExp(pattern.source, pattern.flags.replace("g", ""));
  const m = re.exec(content);
  if (!m) return { content, removed: false };
  const { start, end } = sentenceBoundsAround(content, m.index, m.index + m[0].length);
  const newContent = (content.slice(0, start) + content.slice(end)).replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  // 제거하고 나면 남는 내용이 거의 없어질 정도면(예: 섹션 전체가 상투구
  // 한 문장뿐이었던 극단적인 경우) 차라리 그 문장을 남기는 게 낫다 —
  // 빈 섹션을 내보내는 것보다 상투구 하나 남는 게 훨씬 덜 나쁘다.
  if (newContent.length < 10) return { content, removed: false };
  return { content: newContent, removed: true };
}

/**
 * 최종 안전망 — 실제로 발견된 문제: `detectCliches()`가 걸어둔 1회 재시도로도
 * 상투구가 100% 안 걸러질 수 있다(6·7단계 실측에서 "언제든 답답할 때 같이
 * 이야기하자. 힘내자!"로 끝나는 최종 결과를 실제로 확인 — 정규식 자체는
 * 정상 매치되는 걸 확인했으니 "패턴 누락"이 아니라 "재시도 1회가 완벽한
 * 보장이 아님"이었다). 재시도 횟수를 늘리는 대신, 이 프로젝트에서 반복
 * 써온 패턴대로(stripWeaklySourcedQuotes/stripUnjustifiedNarrativeCitations
 * 와 동일한 철학 — "모델에게 또 묻지 않고 코드가 결정론적으로 확정 처리")
 * 재시도 후에도 남은 상투구는 그 문장을 통째로 제거한다. "다른 표현으로
 * 치환"하려면 결국 LLM 호출이 또 필요해서 결정론적 최종 안전망이라는 목적과
 * 안 맞는다 — 그 상투적 마무리 문장이 없어도 앞 문장까지만으로 글이
 * 자연스럽게 끝나므로(애초에 "덧붙는 상투적 결어"라는 게 이 패턴들의 공통
 * 특징) 제거만으로 충분하다.
 */
/** stripCliches()의 문자열 단위 핵심 로직 — generate-plan.ts의 content(단일
 * 이어진 글)에도 같은 최종 안전망을 적용할 수 있도록 export한다. */
export function stripClichesFromText(content: string, logLabel?: string): { content: string; strippedLabels: string[] } {
  const strippedLabels: string[] = [];
  let result = content;
  for (const { label, pattern } of CLICHE_PATTERNS) {
    // 같은 패턴이 한 섹션에 여러 번 걸릴 가능성은 낮지만, 방어적으로
    // 최대 3회까지 반복 제거한다(무한 루프 방지용 상한일 뿐).
    for (let i = 0; i < 3; i++) {
      const removal = removeSentenceMatching(result, pattern);
      if (!removal.removed) break;
      result = removal.content;
      strippedLabels.push(label);
      console.warn(
        `[generateEssay] 최종 안전장치: 재시도 후에도 남은 상투구 문장을 통째로 제거함 ${logLabel ? `label="${logLabel}" ` : ""}pattern="${label}"`
      );
    }
  }
  return { content: result, strippedLabels };
}

function stripCliches(sections: RawSection[]): { sections: RawSection[]; strippedLabels: string[] } {
  const allLabels = new Set<string>();
  const newSections = sections.map((s) => {
    const { content, strippedLabels } = stripClichesFromText(s.content, s.label);
    strippedLabels.forEach((l) => allLabels.add(l));
    return content === s.content ? s : { ...s, content };
  });
  return { sections: newSections, strippedLabels: Array.from(allLabels) };
}

// 실제로 발견된 버그: 요약(summary_lines) 문장 맨 앞에 아랍 문자 "ف"가
// 통째로 끼어든 사례("ف친구가 겪는 소심함의 원인을...") — 오타가 아니라
// 전혀 다른 문자 체계가 섞여 나온 것으로, analyze.ts에서 이미 겪은 "정수
// 필드에 숫자가 무한 반복되는 토큰 결함"과 같은 계열의 모델 출력 이상
// 현상으로 보인다. 화이트리스트 방식으로 판별한다 — 한글 음절/자모, 영문,
// 숫자, 일반 문장부호·기호(코드 유닛 하나하나가 아니라 유니코드 카테고리
// \p{P}(구두점)·\p{S}(기호)로 판별해서 『』《》「」…—· 같은 것도 전부
// 안전하게 허용)만 통과시키고, 그 외 문자 체계(아랍어, 키릴 문자, 태국어
// 등)는 전부 이상 문자로 본다 — "허용 목록에 없는 걸 잡는" 게 아니라
// "알려진 정상 범위만 통과시키는" 방향이 더 안전하다(새로운 이상 문자
// 유형이 나와도 놓치지 않음).
// 라틴 문자 전체(\p{Script=Latin})를 허용한다 — 세계사·음악·미술 과제에서 흔한 악센트 문자
// (Ancien Régime, Dvořák, Für Elise)를 예전 필터(a-zA-Z만 허용)가 통째로 삭제해서
// "Rgime"처럼 깨뜨렸다(2026-09-19 14종 테스트에서 발견). 실제 보고된 오염은 아랍 문자
// 등 다른 문자 체계라 그쪽은 계속 막는다.
const ALLOWED_TEXT_PATTERN = /[가-힣ᄀ-ᇿ㄰-㆏a-zA-Z0-9\p{Script=Latin}\p{P}\p{S}\s]/u;

/** 코드포인트 단위로 순회한다(서로게이트 쌍이 섞여도 안전) — 문자열 인덱스
 * 기반 순회는 이모지 등에서 반쪽 문자를 만들 수 있어서 피한다. */
// 한글 바로 뒤 괄호 속 한자 병기("부(富)")는 정상 표기다 — 실측(2026-10-21): 이상 문자로 판정돼 전체 재생성(+13초)을 부르고 "부()"로 깨졌다.
// 같은 길이의 한글로 가려서 판정하고, 지울 때도 가린 쪽 기준으로 고른다(BMP 한자 1글자 = 한글 1글자라 위치가 그대로다).
const HANJA_GLOSS = /([가-힣])\((\p{Script=Han}{1,12})\)/gu;
// 그리스 문자(ΔT, ΔH, α, π)는 수학·과학 글의 정상 표기다 — 실측(2026-10-22): 과학 탐구 보고서의 Δ가 이상 문자로 판정돼 재생성(+13.7초) 후 "온도 상승 T"로 깨졌다.
const GREEK = /\p{Script=Greek}/gu;
// 아래·위 첨자 숫자(H₂O, CO₂, m²)도 정상 표기다 — 실측(2026-10-22): "₂"(U+2082) 때문에 과학 보고서가 재생성(+18.7초)됐다.
const OTHER_NUMBER = /\p{No}/gu;
function maskHanjaGloss(text: string): string {
  return qualityFixesOn()
    ? text.replace(HANJA_GLOSS, (_m, h: string, han: string) => `${h}(${"가".repeat([...han].length)})`).replace(GREEK, "a").replace(OTHER_NUMBER, "1")
    : text;
}

function findForeignScriptChars(text: string): string[] {
  const found: string[] = [];
  for (const ch of maskHanjaGloss(text)) {
    if (!ALLOWED_TEXT_PATTERN.test(ch)) found.push(ch);
  }
  return found;
}

function hasForeignScriptCorruption(text: string): boolean {
  for (const ch of maskHanjaGloss(text)) {
    if (!ALLOWED_TEXT_PATTERN.test(ch)) return true;
  }
  return false;
}

function detectForeignScriptCorruption(sections: RawSection[]): string[] {
  return sections.filter((s) => hasForeignScriptCorruption(s.content)).map((s) => s.label);
}

/** 허용 목록 밖 문자를 전부 제거한다(치환이 아니라 삭제 — 신뢰할 수 없는
 * 문자라 대체할 근거가 없고, 붙어 나온 사례처럼 애초에 있으면 안 되는
 * 글자라 지우는 게 자연스럽다). 삭제 후 생기는 이중 공백만 정리한다. */
function stripForeignScriptCharsFromText(text: string): { text: string; strippedChars: string[] } {
  const strippedChars = findForeignScriptChars(text);
  if (strippedChars.length === 0) return { text, strippedChars };
  let result = "";
  const chars = [...text];
  const masked = [...maskHanjaGloss(text)];
  chars.forEach((ch, i) => {
    if (ALLOWED_TEXT_PATTERN.test(masked[i] ?? ch)) result += ch;
  });
  result = result.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
  return { text: result, strippedChars };
}

/**
 * 최종 안전망 — 재시도까지 거치고도 남을 수 있는 이상 문자(다른 문자 체계)를
 * 코드가 확정적으로 제거한다. 1~2글자가 문장에 끼어든 정도(실제 보고된
 * 사례)는 이 정리만으로 충분히 해결되고, 만에 하나 전체가 심하게 깨진
 * 경우라도 최소한 이상 문자만큼은 남지 않는 상태로 보정된다(위에서 이미
 * 품질 재시도가 한 번 더 새로 써볼 기회를 줬으므로, 이 함수는 그 이후에도
 * 남는 것만 처리하는 마지막 방어선).
 */
function stripForeignScriptCorruption(sections: RawSection[]): { sections: RawSection[]; strippedLabels: string[] } {
  const strippedLabels: string[] = [];
  const newSections = sections.map((s) => {
    const { text, strippedChars } = stripForeignScriptCharsFromText(s.content);
    if (strippedChars.length === 0) return s;
    strippedLabels.push(s.label);
    console.warn(
      `[generateEssay] 최종 안전장치: 이상 문자(다른 문자 체계) 제거함 label="${s.label}" chars=${JSON.stringify(strippedChars)}`
    );
    return { ...s, content: text };
  });
  return { sections: newSections, strippedLabels };
}

/** summary_lines(전체 요약)도 본문과 같은 검사를 거친다 — 실제 보고된 사고가
 * 바로 이 필드에서 일어났다. */
function stripForeignScriptFromSummary(summaryLines: string[]): { summaryLines: string[]; strippedCount: number } {
  let strippedCount = 0;
  const newLines = summaryLines.map((line) => {
    const { text, strippedChars } = stripForeignScriptCharsFromText(line);
    if (strippedChars.length === 0) return line;
    strippedCount += strippedChars.length;
    return text;
  });
  if (strippedCount > 0) {
    console.warn(`[generateEssay] 최종 안전장치: 전체 요약(summary_lines)의 이상 문자 ${strippedCount}개 제거함`);
  }
  return { summaryLines: newLines, strippedCount };
}


/**
 * 분량 범위를 못 맞춘 글 하나를 검색 없이 한 번 보정한다. 모델이 사실·출처를 새로 지어내지 못하도록 결과를 코드로 검증한다:
 * 각주 번호는 원문에 있던 것만(전부 유지), 따옴표 인용문은 그대로 남아야 하고, 범위에 들어오거나 지금보다 범위에 가까워져야 채택한다.
 */
/** 검색 없이 해당 단계만 고친다 — 소제목 없는 단계의 필수 항목 누락, 다른 단계와 거의 같은 문장. 고친 결과가 검증을 못 통과하면 원문을 그대로 둔다. */
async function repairLocally(
  attempt: Attempt,
  elements: CoreTaskInfo["task_elements"],
  gaps: CoverageGap[],
  repeated: ReturnType<typeof findRepeatedStatements>,
  /** 누락이 아니라 "고쳐 써야 할 문장"을 지적하는 지시(하지 않은 활동을 썼다고 한 문장 등). */
  rewrites: { label: string; instruction: string }[] = []
): Promise<Attempt> {
  const markersOf = (t: string) => t.match(/\[\d+\]/g) ?? [];
  const allMarkers = new Set(attempt.sections.flatMap((s) => markersOf(s.content)));
  const jobs = attempt.sections.map(async (sec) => {
    const issues: string[] = [];
    const gap = gaps.find((g) => g.label === sec.label);
    if (gap) issues.push(`다음 내용이 다뤄지지 않았다 — 이 단계의 형식에 맞게 실제 문장으로 추가할 것: ${gap.missing.join(", ")}`);
    for (const r of rewrites.filter((x) => x.label === sec.label)) issues.push(r.instruction);
    // 되풀이는 뒤쪽 단계(b)의 문장을 다른 표현으로 고친다(앞 단계는 사실을 정리한 자료이므로 그대로 둔다).
    const dups = repeated.filter((p) => p.b.label === sec.label);
    if (dups.length > 0) {
      const quoted = dups.slice(0, 5).map((p) => `"${p.b.text.replace(/\[\d+\]/g, "").slice(0, 60)}…"`).join(" / ");
      issues.push(`앞 단계의 문장과 거의 같은 문장이 되풀이됐다 — 사실(연도·이름·수치)은 그대로 두고 이 단계의 형식에 맞는 다른 문장으로 고칠 것: ${quoted}`);
    }
    if (issues.length === 0) return sec;
    const el = elements.find((e) => e.label === sec.label);
    const others = attempt.sections
      .filter((s) => s.label !== sec.label)
      .map((s) => `## ${s.label}\n${s.content}`)
      .join("\n\n");
    try {
      const res = await generate({
        label: "generateEssay:repair",
        role: "main",
        effort: "low",
        prompt: `
아래는 수행평가 한 단계의 원고다. 지적된 문제만 고쳐서 이 단계 본문 전체를 다시 써줘.
- 지적되지 않은 문장과 사실(연도·이름·수치), [n] 각주 표기는 그대로 둘 것. 각주 번호를 새로 만들거나 바꾸지 말 것.
- 새로 쓰는 문장은 이 글과 [같은 과제의 다른 단계]에 이미 있는 사실만 바탕으로 쓰고, 새 연도·수치·고유명·인용문을 만들지 말 것. 다른 단계의 문장에 붙은 [n]은 같은 사실을 쓸 때 그대로 붙여도 된다.
- 소제목(###)·표·"(학생 감상 초안 …)" 표시 등 기존 형식은 유지하고, 설명·머리말 없이 본문만 출력할 것.
${el ? `- 이 단계가 다뤄야 할 내용: ${el.description}\n` : ""}
[고칠 문제]
${issues.map((i) => `- ${i}`).join("\n")}

[같은 과제의 다른 단계]
${others || "(없음)"}

[이 단계 원고]
${sec.content}`.trim(),
      });
      const next = res.text.trim();
      if (!next) return sec;
      const nextMarkers = markersOf(next);
      if (nextMarkers.some((m) => !allMarkers.has(m))) return sec; // 없는 각주 번호를 만들었다
      const origMarkers = markersOf(sec.content);
      if (origMarkers.length > 0 && nextMarkers.length < origMarkers.length * 0.7) return sec; // 각주가 눈에 띄게 사라졌다
      if (next.length < sec.content.length * 0.7 || next.length > sec.content.length * 1.8) return sec;
      console.log(`[generateEssay] 부분 보완 적용 label="${sec.label}" (${sec.content.length}→${next.length}자) ${issues.length}건`);
      return { ...sec, content: next };
    } catch (err) {
      console.error("[generateEssay] 부분 보완 실패(원문 유지)", err);
      return sec;
    }
  });
  return { ...attempt, sections: await Promise.all(jobs) };
}

/**
 * 분량 보정. 한 번에 목표를 넘겨 반대쪽으로 벗어나면(실측: 1222자 → 1888자, 목표 1350~1650) 그 결과를 바탕으로 한 번 더 반대 방향으로 보정하고,
 * 원래보다 범위에 가까워졌을 때만 쓴다.
 */
async function adjustSectionLength(content: string, issue: LengthIssue, description: string): Promise<string | null> {
  const measure = (t: string) => (issue.unit === "words" ? countWords(t) : countChars(t, issue.countsSpaces));
  const distance = (n: number) => (issue.min > 0 && n < issue.min ? issue.min - n : issue.max > 0 && n > issue.max ? n - issue.max : 0);
  const first = await adjustSectionLengthOnce(content, issue, description);
  if (first.accepted) return first.accepted;
  if (!first.candidate) return null;
  const candidateLen = measure(first.candidate);
  if (distance(candidateLen) === 0) return first.candidate;
  const second = await adjustSectionLengthOnce(first.candidate, { ...issue, actual: candidateLen }, description);
  return second.accepted && distance(measure(second.accepted)) < distance(issue.actual) ? second.accepted : null;
}

async function adjustSectionLengthOnce(
  content: string,
  issue: LengthIssue,
  description: string
): Promise<{ accepted?: string; candidate?: string }> {
  const uw = unitWord(issue.unit);
  const measure = (t: string) => (issue.unit === "words" ? countWords(t) : countChars(t, issue.countsSpaces));
  const distance = (n: number) => (issue.min > 0 && n < issue.min ? issue.min - n : issue.max > 0 && n > issue.max ? n - issue.max : 0);
  const shorten = issue.max > 0 && issue.actual > issue.max;
  const goal = issue.min > 0 && issue.max > 0 ? Math.round((issue.min + issue.max) / 2) : issue.min > 0 ? Math.round(issue.min * 1.1) : Math.round(issue.max * 0.85);
  const res = await generate({
    label: "generateEssay:lengthAdjust",
    role: "main",
    prompt: `
아래 글의 분량을 ${lengthRangeText(issue)}(${issue.unit === "words" ? "영어 단어 수" : issue.countsSpaces ? "공백 포함" : "공백 제외"}) 범위로 고쳐서 글 전체를 다시 써줘. 지금은 ${issue.actual}${uw}이고 목표는 약 ${goal}${uw}다.
${shorten ? "- 핵심 내용과 필수 항목은 남기고 중복·군더더기 표현만 덜어낼 것." : "- 이미 있는 내용을 설명·이유·연결·구체화로 자연스럽게 늘릴 것. 새로운 사실·수치·연도·인물·인용문·출처를 추가하지 말 것(기존에 없는 사실은 쓰지 말 것)."}
- 기존 문장의 각주 표기([1] 등)와 따옴표로 직접 인용한 문장은 그대로 유지할 것. 각주를 새로 만들거나 번호를 바꾸지 말 것.
- 굵게(**…**) 표시된 문장·표현(채점 대상 어법 등)은 한 글자도 바꾸지 말고 그대로 남길 것.
- 글의 언어·문체·형식(소제목 등)은 그대로 유지하고, 분량을 채우려고 같은 말을 반복하지 말 것.
${description ? `- 이 글이 다뤄야 할 내용: ${description}\n` : ""}결과는 고친 글 본문만 출력할 것(설명·머리말 없이).

[글]
${content}`.trim(),
  });
  const next = res.text.trim();
  if (!next) return {};
  const orig = new Set(content.match(/\[\d+\]/g) ?? []);
  const nextMarkers = new Set(next.match(/\[\d+\]/g) ?? []);
  if ([...orig].some((m) => !nextMarkers.has(m)) || [...nextMarkers].some((m) => !orig.has(m))) {
    console.warn(`[generateEssay] 분량 보정 거부(각주 변경) label="${issue.label}"`);
    return {};
  }
  // 굵게 표시한 채점 대상 문장(영어 필수 어법 등)이 줄이면서 빠지면 거부한다.
  const bolds = [...content.matchAll(/\*\*([^*\n]{4,})\*\*/g)].map((m) => m[1].trim());
  if (bolds.some((b) => !next.includes(b))) {
    console.warn(`[generateEssay] 분량 보정 거부(굵게 표시한 문장 변경) label="${issue.label}"`);
    return {};
  }
  const quotes = [...content.matchAll(/[「『“"]([^」』”"\n]{4,})[」』”"]/g)].map((m) => m[1]);
  if (quotes.some((q) => !next.includes(q))) {
    console.warn(`[generateEssay] 분량 보정 거부(인용문 변경) label="${issue.label}"`);
    return {};
  }
  const hangul = (t: string) => (t.match(/[가-힣]/g) ?? []).length / Math.max(1, t.replace(/\s/g, "").length);
  if (issue.unit === "words" && hangul(next) > 0.05 && hangul(content) <= 0.05) return {};
  if (issue.unit !== "words" && koreanGuardOn() && flippedToEnglish(content, next)) {
    console.warn(`[generateEssay] 분량 보정 거부(한국어 글이 영어로 바뀜) label="${issue.label}"`);
    return {};
  }
  if (distance(measure(next)) >= distance(issue.actual)) {
    console.warn(`[generateEssay] 분량 보정 거부(범위에 가까워지지 않음) label="${issue.label}" ${issue.actual}->${measure(next)}`);
    return { candidate: next };
  }
  return { accepted: next };
}
