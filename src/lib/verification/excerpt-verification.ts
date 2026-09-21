import { generate } from "@/lib/llm";
import { Type, type Schema } from "@google/genai";

// 외부 자료(책/논문/뉴스/통계 등)를 인용할 때 "실제로 원문이 노출된 페이지가
// 있는지"를 검증하는 범용 모듈. 책 전용 로직이 아니다 — 인용 대상의 종류
// (책인지 논문인지)를 이 모듈은 전혀 몰라도 되게 만든다. 지금 당장은
// studed에서 책(책 처방전 과제)에만 쓰이지만, 나중에 논문 인용·통계자료
// 인용·뉴스 인용처럼 "외부 사실 검증이 필요한" 다른 과제 유형에도 그대로
// 재사용할 수 있도록 인터페이스를 일반화해뒀다 — 대상 이름/저자(발행 주체)/
// 검증할 문장만 파라미터로 받고, "책"이라는 단어는 이 파일 어디에도 로직으로
// 등장하지 않는다(쿼리 템플릿 프리셋 이름에만 등장 — 그건 사용하는 쪽이
// 고르는 프리셋일 뿐, 엔진 자체와는 무관하다).
//
// 참고: 현재 studed 안에서 이 모듈을 실제로 쓰는 곳은 generate-essay.ts
// (책 처방전 등 완성 원고 경로)뿐이다. 실행계획 경로(generate-plan.ts, PPT/
// 포스터처럼 외부 제작이 필요한 과제)는 이 모듈과 완전히 별도로 자체
// googleSearch 그라운딩 호출을 직접 하고 있고, 인용 품질 검증(위키/동영상
// 배제, 직접인용 검증 등)이 아예 없다 — 두 경로는 buildSourceList/
// validateSources 같은 하위 유틸(citations.ts, validate-sources.ts)만
// 공유할 뿐, 이 파일의 검증 로직은 공유하지 않는다.

export interface VerificationTarget {
  /** 인용 대상의 이름 — 책 제목, 논문 제목, 통계자료명 등 (자료 종류 무관) */
  name: string;
  /** 저자, 발행 기관 등 부가 식별 정보 (있으면 검색 정확도가 올라간다) */
  attribution?: string;
  /** 검증하려는 구체적 원문 후보. 없으면 "실제로 노출된 인용하기 좋은 구절을
   * 찾아달라"는 개방형 검색으로 대체한다. */
  excerptCandidate?: string;
}

export type QueryTemplate = (target: VerificationTarget) => string;

export interface VerificationResult {
  verified: boolean;
  /** 검증에 성공한 경우 실제로 확인된 원문(입력한 excerptCandidate와 표현이
   * 약간 다를 수 있다 — 모델이 실제 페이지에서 그대로 옮긴 것이므로 이쪽이
   * 더 정확하다). */
  confirmedExcerpt?: string;
  source?: { title: string; url: string };
  /** 실제로 확인에 성공한 검색어 (모델이 자체적으로 하나만 시도했을 수도, 여러
   * 개를 순서대로 시도했을 수도 있다 — 성공 시 마지막으로 쓴 검색어). */
  matchedQuery?: string;
  /** 모델이 실제로 호출한 검색어 전체(1차+각도를 바꾼 재시도 포함) — 실패했을
   * 때 "여기까지 시도했다"를 사용자/로그에 보여주기 위한 진단용. */
  queriesTried: string[];
}

// 책 대상 프리셋 — "책 제목 + 책속으로/발췌/명언/리뷰 인용/원문"처럼 서로 다른
// 각도의 쿼리를 순서대로 시도한다. 앞선 쿼리에서 이미 확인되면 뒤 쿼리는
// 모델이 알아서 생략해도 된다고 프롬프트에 명시한다(아래 buildInvestigationPrompt).
export const BOOK_EXCERPT_QUERY_TEMPLATES: QueryTemplate[] = [
  (t) => `"${t.name}" 책속으로`,
  (t) => `"${t.name}" 발췌`,
  (t) => `"${t.name}" 명언`,
  (t) => `"${t.name}" 리뷰 인용`,
  (t) => `"${t.name}" ${t.attribution ?? ""} 원문`.trim(),
];

// 통계/뉴스/논문 등 generate-plan.ts 경로에서 쓰는 프리셋 — 책의
// "책속으로/발췌/명언" 각도와 같은 역할을 한다. target.name에는 검증할
// 통계·사실 주장이 담긴 문장(또는 그 핵심 키워드)이 온다.
export const STATISTIC_OR_NEWS_QUERY_TEMPLATES: QueryTemplate[] = [
  (t) => `"${t.name}" 통계 원문`,
  (t) => `"${t.name}" 보도자료`,
  (t) => `"${t.name}" 공식 발표 자료`,
  (t) => `"${t.name}" 논문 원문`,
  (t) => `"${t.name}" ${t.attribution ?? ""} 출처`.trim(),
];

// 동영상 플랫폼은 자막/설명란에 텍스트가 있어도 영상 본편과 실제로 일치하는지
// 원문 대조가 불가능하고, 위키형 페이지는 자유 편집이라 원문 그대로라는 보장이
// 없다 — 둘 다 "직접 인용 문장" 검증 용도로는 신뢰하지 않는다(서지정보 확인
// 같은 다른 용도의 보조자료로는 여전히 허용될 수 있음 — 그건 이 판별과 별개).
// 도메인을 소수 나열하는 게 "특정 서점을 우선하라"던 화이트리스트와 다른 점은,
// 이건 신뢰도 순위를 매기는 게 아니라 "텍스트 대조가 구조적으로 불가능/불안정한
// 매체인지"를 판별하는 것뿐이라는 점이다.
//
// 개인 블로그 플랫폼(리뷰/독후감성 게시글)도 실제로 발견된 버그로 이 목록에
// 추가됐다: 책 발췌 페이지처럼 보여도 실제로는 원문을 정확히 옮기지 않은
// 리뷰/감상 페이지인 경우가 많은데도, 도메인 자체는 위키/동영상이 아니라서
// "신뢰 가능"으로 통과되고 그 상태로 지어낸 인용구에 각주만 붙는 사고가 있었다
// (『체리새우: 비밀글입니다』 인용구가 섹션마다 다른 문장으로 나왔는데 둘 다
// tistory.com/youtube.com 조합 각주가 붙어 있던 사례). 서점 "책속으로"/전자책
// 미리보기/발행처 발췌 페이지처럼 원문 편집 권한이 있는 주체가 올린 페이지와
// 달리, 개인 블로그는 누구나 올릴 수 있어 원문과의 정확한 일치를 구조적으로
// 보장할 수 없다 — 그래서 동영상/위키와 같은 급으로 취급한다.
const VIDEO_PLATFORM_HOSTS = ["youtube.com", "youtu.be", "m.youtube.com"];
const WIKI_HOSTS = ["namu.wiki", "wikipedia.org", "wikitree.co.kr"];
const REVIEW_BLOG_HOSTS = [
  "tistory.com",
  "blog.naver.com",
  "brunch.co.kr",
  "blogspot.com",
  "blog.daum.net",
  "story.kakao.com",
  "medium.com",
  "egloos.com",
];

function hostMatches(url: string, hosts: string[]): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return hosts.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export function isVideoPlatformUrl(url: string): boolean {
  return hostMatches(url, VIDEO_PLATFORM_HOSTS);
}

export function isWikiUrl(url: string): boolean {
  return hostMatches(url, WIKI_HOSTS);
}

export function isReviewBlogUrl(url: string): boolean {
  return hostMatches(url, REVIEW_BLOG_HOSTS);
}

/** 직접 인용 문장의 근거로는 신뢰하지 않는 출처(동영상 OR 위키형 OR 개인 블로그). */
export function isWeakQuoteSource(url: string): boolean {
  return isVideoPlatformUrl(url) || isWikiUrl(url) || isReviewBlogUrl(url);
}

// 실제로 발견된 버그: "그 페이지에 실제로 노출된 텍스트인가"와 "그 텍스트가
// 책 본문(발췌)인가"는 서로 다른 질문인데, 검증 로직이 전자만 확인하고
// 넘어가서 서점 상세페이지의 저자 소개/마케팅 카피(3인칭으로 저자·책을
// 홍보하는 문장, 예: "저자들은 수많은 강연에서 뜨거운 호응을 얻으며...")를
// "책 속 인상 깊은 구절"로 잘못 채택한 사례가 있었다. 완벽한 판별은 아니고
// (이 프로젝트에서 반복 써온 "명백한 신호만 잡는" 수준의 기계적 안전장치),
// 3인칭으로 저자/책 자체를 소개하는 문두 패턴과 광고성 수사 어휘 둘 중 하나만
// 걸려도 마케팅 카피로 간주한다 — 실제 책 본문(대사·서술·조언 문장 등)은
// 이런 패턴에 거의 걸리지 않는다.
const MARKETING_LEAD_PATTERN = /^\s*(저자(들)?는|이\s*책은|이\s*책에서는|작가는|지은이는)\b/;
const MARKETING_RHETORIC_PATTERN =
  /강연|호응을|신뢰를\s*받고\s*있는|노하우를\s*털어놓|베스트셀러|화제를\s*모았|극찬|필독서|추천사|스테디셀러|사랑받고\s*있는|많은\s*독자(들)?(에게|의)/;

/** 검증된 원문이라도 "책 속 발췌"가 아니라 "서점/출판사의 저자·책 소개 카피"로
 * 보이면 인용 후보에서 배제한다. */
export function looksLikeMarketingCopy(text: string): boolean {
  return MARKETING_LEAD_PATTERN.test(text) || MARKETING_RHETORIC_PATTERN.test(text);
}

/** 배열을 startIndex부터 시작하도록 앞뒤를 돌린다 — 재시도할 때 같은 쿼리
 * 순서를 그대로 반복하지 않고 다른 각도부터 먼저 보여주기 위해 쓴다. */
function rotate<T>(items: T[], startIndex: number): T[] {
  if (items.length === 0) return items;
  const offset = ((startIndex % items.length) + items.length) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

// generate-essay.ts의 메인 생성 호출이 실제로 검색을 잘 트리거한다는 게 이미
// 여러 라운드의 실측으로 확인돼 있다 — 그 호출의 공통점은 "검색을 최종 목적이
// 아니라 긴 글을 쓰는 과정의 한 단계"로 제시한다는 것과, 아래와 거의 같은
// 문구로 검색을 강하게 지시한다는 것이다. 반면 이 파일의 초기 버전은 "yes/no로
// 짧게 답하라"는 퀴즈형 프롬프트를 썼는데, 실측 결과 모델이 검색 도구를 아예
// 호출하지 않고 훈련 데이터 기억만으로 no라고 답하거나(심지어 재지시해도
// 반복됨), 더 나쁘게는 "검색했다"고 말로만 주장하고 실제로는 groundingMetadata가
// 텅 빈 채로 답하는 경우까지 관찰됐다. 그래서 이 함수는 generate-essay.ts와
// 똑같은 2단계 패턴(①그라운딩 켠 자유 서술 조사 → ②그라운딩 없이 구조화 추출)
// 을 그대로 따른다 — ①단계를 "리서치 메모를 자유롭게 써라"로 열어두면 모델이
// 자연스럽게 검색을 실제로 수행하는 빈도가 눈에 띄게 올라감을 확인했다.
function buildInvestigationPrompt(target: VerificationTarget, queryTemplates: QueryTemplate[], extraNote?: string): string {
  const queries = queryTemplates.map((q) => q(target)).filter(Boolean);

  const excerptBlock = target.excerptCandidate
    ? `[검증하려는 문장] "${target.excerptCandidate}"\n이 문장(또는 의미가 완전히 같은 표현)이 실제로 노출된 페이지를 찾을 것.`
    : `특정 문장은 정해지지 않았다. 실제로 원문이 노출된 페이지를 찾고, 그 안에서 짧고 인상적인 한 문장을 있는 그대로 가져올 것.`;

  return `
너는 인용 검증을 위해 실제로 조사하는 리서처다.

[인용 대상] ${target.name}${target.attribution ? ` — ${target.attribution}` : ""}
${excerptBlock}
${extraNote ? `\n${extraNote}\n` : ""}
【검색 도구를 실제로 호출할 것 — 매우 중요】 위 문장/사실이 실제로 노출된
페이지를 찾기 위해 반드시 실시간 웹 검색 도구를 최소 한 번 이상 실제로
호출해서 확인할 것. 이미 잘 알려진 대상이라고 생각되더라도 예외 없이 검색으로
재확인한 뒤 결론 낼 것 — "이미 아는 내용이니 검색은 생략해도 된다"고 판단하지
말 것. 검색 없이 기억만으로 답하는 것은 이 조사에서 아무 의미가 없다.

시도해볼 검색어(순서대로 — 앞선 검색어에서 이미 확인됐으면 뒤는 생략해도 된다.
하나가 실패했다고 바로 포기하지 말고 다음으로 넘어갈 것):
${queries.map((q, i) => `${i + 1}. ${q}`).join("\n")}

원문이 실제로 노출된 "텍스트" 페이지만 인정한다 — 인용 대상의 종류에 따라
형태는 다를 수 있다(예시일 뿐 다른 사이트여도 같은 형태면 인정할 것): 전자책
미리보기·서점의 "책속으로"·발행처 발췌 페이지(책), 보도자료 원문·통계청 등
공공기관 발표자료·논문 원문(뉴스/통계/논문) 등. 다음은 원문 노출로 인정하지 않는다:
- 소개·요약만 있고 원문/원자료 자체는 안 보이는 페이지 (예: "이 책은 ~에
  대한 이야기다", "관련 통계가 있다" 같은 요약 문장은 원문이 아니다)
- 동영상 페이지 (자막/설명란에 있어도 영상 본편과 실제 일치하는지 원문 대조가 불가능)
- 여러 사람이 자유롭게 고쳐 쓰는 위키형 페이지(나무위키, 위키백과 등), 익명
  게시판형 페이지의 재인용 — 이런 페이지가 검색되면 그 자체를 근거로 verified라고
  결론 내리지 말 것.
- 개인 블로그의 리뷰/독후감 페이지(티스토리, 네이버 블로그, 브런치 등) — 원문을
  그대로 옮겨 적은 것처럼 보여도, 원문 편집 권한이 없는 개인이 옮겨 적은 것이라
  실제 원문과 정확히 일치하는지 보장할 수 없다. 이런 페이지만 검색되면 verified로
  결론 내리지 말고, 서점/전자책/발행처처럼 원문 편집 권한이 있는 페이지를 추가로
  찾아볼 것.

【서점 상세페이지 안에서도 섹션을 구분할 것 — 매우 중요, 실제로 발견된 버그】
서점(교보문고/예스24/알라딘 등) 상세페이지는 보통 "책 소개"(출판사가 책을
홍보하려고 쓴 카피)와 "책속으로"/"미리보기"/"발췌"(실제 책 본문 일부)가 서로
다른 섹션으로 나뉘어 있다. 반드시 후자에서만 문장을 가져올 것 — 전자("책
소개")는 페이지에 실제로 노출된 텍스트라도 책 "본문"이 아니므로 인용 후보로
쓰지 말 것. "책 소개" 카피는 다음 특징으로 구분한다: (1) "저자는", "이
책은", "작가는"처럼 3인칭으로 저자·책 자체를 소개·설명하는 문장으로
시작한다, (2) "강연", "호응을 얻었다", "신뢰를 받고 있는", "노하우를
털어놓았다", "베스트셀러", "화제를 모았다" 같은 광고성 수사가 들어 있다.
이런 문장을 발견했다면 그건 원문 발췌가 아니다 — verified로 결론 내리지
말고, 같은 페이지나 다른 페이지의 "책속으로"/"미리보기" 섹션을 추가로
찾아볼 것.

조사한 내용과 결론을 자유롭게 서술할 것 — 형식은 정해져 있지 않다. 어떤
검색어로 무엇을 확인했는지, 원문이 실제로 노출된 페이지를 찾았는지, 찾았다면
정확히 어떤 문장과 어느 페이지였는지를 분명하게 밝힐 것.
`.trim();
}

export const VERIFICATION_EXTRACT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    verified: {
      type: Type.BOOLEAN,
      description: "조사자가 원문이 실제로 노출된 텍스트 페이지를 찾았다고 명확히 결론 내렸으면 true, 못 찾았거나 애매하면 false",
    },
    excerpt: { type: Type.STRING, description: "확인됐다고 밝힌 문장 그대로. 없으면 빈 문자열." },
    sourceTitle: { type: Type.STRING, description: "그 페이지의 제목이나 사이트 이름. 없으면 빈 문자열." },
  },
  required: ["verified", "excerpt", "sourceTitle"],
};

async function extractVerificationOutcome(
  investigationText: string
): Promise<{ verified: boolean; excerpt?: string; sourceTitle?: string }> {
  const resp = await generate({
      label: "verifyExcerpt:extract",
      role: "lite",
      prompt: `아래는 어떤 조사자가 인용 검증을 위해 웹 검색을 하고 남긴 리서치 메모다. 이 메모를 읽고 구조화된 결론을 뽑아줘.\n\n[리서치 메모]\n${investigationText}`,
      schema: VERIFICATION_EXTRACT_SCHEMA,
    });
  const raw = resp.text;
  if (!raw) return { verified: false };
  const parsed = JSON.parse(raw) as { verified: boolean; excerpt: string; sourceTitle: string };
  return {
    verified: parsed.verified,
    excerpt: parsed.excerpt || undefined,
    sourceTitle: parsed.sourceTitle || undefined,
  };
}

async function runInvestigation(prompt: string) {
  const resp = await generate({
      label: "verifyExcerpt:investigate",
      role: "main",
      prompt: prompt,
      search: { force: true }, // 이 단계는 검색 자체가 목적
    });
  const text = resp.text ?? "";
  const grounding = resp.grounding;
  const queriesTried = grounding?.queries ?? [];
  const chunks = grounding?.chunks ?? [];
  console.log(
    `[verifyExcerpt] queriesTried=${JSON.stringify(queriesTried)} chunks=${chunks.length} investigationText=${text.slice(0, 400)}`
  );
  return { text, queriesTried, chunks };
}

type Investigation = Awaited<ReturnType<typeof runInvestigation>>;

/** 조사 결과 하나를 최종 VerificationResult로 판정한다. 모델의 "verified: true"
 * 자기선언만으로는 안 믿고, 실제 그라운딩 출처가 있어야 하고, 그 출처가 동영상/
 * 위키(isWeakQuoteSource)면 모델이 규칙을 놓쳤더라도 코드가 한 번 더 걸러낸다 —
 * 검색 없이 "확인했다"고 지어내거나, 위키/동영상을 원문 노출로 잘못 인정하는
 * 것 둘 다 방지하기 위한 이중 안전장치. */
async function judge(investigation: Investigation): Promise<VerificationResult> {
  const outcome = await extractVerificationOutcome(investigation.text);
  const firstTrustworthyChunk = investigation.chunks.find(
    (c) => c.web?.uri && !isWeakQuoteSource(c.web.uri)
  );
  const isMarketingCopy = !!outcome.excerpt && looksLikeMarketingCopy(outcome.excerpt);

  if (!outcome.verified || !outcome.excerpt || !firstTrustworthyChunk?.web?.uri || isMarketingCopy) {
    if (outcome.verified && outcome.excerpt && !firstTrustworthyChunk) {
      console.warn(
        `[verifyExcerpt] 조사자는 verified=true라고 했지만 그라운딩 출처가 없거나 전부 동영상/위키/블로그뿐이라 신뢰하지 않음`
      );
    }
    if (outcome.verified && outcome.excerpt && firstTrustworthyChunk && isMarketingCopy) {
      console.warn(
        `[verifyExcerpt] 조사자는 verified=true라고 했지만 저자 소개/마케팅 카피로 보여 신뢰하지 않음: "${outcome.excerpt}"`
      );
    }
    return { verified: false, queriesTried: investigation.queriesTried };
  }

  return {
    verified: true,
    confirmedExcerpt: outcome.excerpt,
    source: {
      // chunk.web.title은 Gemini 그라운딩이 준 도메인 형태 표기(예: "yes24.com")라
      // buildSourceList()가 다른 출처에 쓰는 표기와 형식이 일치한다 — outcome.sourceTitle은
      // 조사 LLM이 자유 서술한 설명 문구(예: "예스24 및 알라딘 공식 도서 상세 페이지")라
      // 화면에 그대로 노출하면 다른 출처들과 표기 형식이 어긋난다(실제로 발견된 버그).
      // 그래서 도메인 표기를 우선하고, 그게 없을 때만 조사 LLM의 설명으로 보완한다.
      title: firstTrustworthyChunk.web.title || outcome.sourceTitle || firstTrustworthyChunk.web.uri,
      url: firstTrustworthyChunk.web.uri,
    },
    matchedQuery: investigation.queriesTried[investigation.queriesTried.length - 1],
    queriesTried: investigation.queriesTried,
  };
}

// 4단계(검증 재시도 강화): 실제로 발견된 문제 — 덜 유명한 항목이 "검색은
//했는데 한 번 못 찾았다"는 이유만으로 바로 실패 처리되면, 후보 선택
// (selectBookCandidate)이 다양성을 고려해 골라준 의미가 없어진다("검증
// 가능성 때문에 다양성이 희생되는" 문제). 그래서 "검색은 했는데 실패"한
// 경우엔 최대 2회 더(총 3회) 각도를 바꿔가며 시도한 뒤에만 최종 실패로
// 처리한다 — BOOK_EXCERPT_QUERY_TEMPLATES의 5개 각도를 더 넉넉히 소진하려는
// 목적. 존재하지 않는 출처를 지어내게 유도하는 게 아니라 "진짜 있을 수도
// 있는 원문을 못 찾고 포기하는" 쪽을 줄이는 것뿐이라 judge()의 이중
// 안전장치(그라운딩 출처 필수, 위키/동영상/블로그·마케팅 카피 배제)는
// 그대로 유지된다. "검색 자체를 한 번도 안 함"(모델이 지시를 무시)은 각도
// 문제가 아니라 순응 문제라 기존처럼 1회 강한 재지시만 한다.
const MAX_ANGLE_RETRIES = Number(process.env.VERIFY_EXCERPT_MAX_ANGLE_RETRIES ?? 2);

/**
 * 인용 대상의 원문이 실제로 노출된 페이지를 찾아 검증한다. generate-essay.ts의
 * 메인 생성 호출과 같은 2단계 패턴을 쓴다 — ①그라운딩 켠 자유 서술 조사 →
 * ②그라운딩 없이 결론만 구조화 추출.
 *
 * 1차 시도가 실패하면 반드시 "다른 검색"으로 재시도한다(같은 쿼리 반복 금지):
 * - 검색 도구 자체를 한 번도 안 불렀으면(기억만으로 답함) 같은 쿼리 목록을
 *   더 강하게 요구하며 1회 재시도.
 * - 실제로 검색은 했는데 못 찾았으면, 쿼리 목록의 순서를 매번 다르게 돌려서
 *   (rotate) 아직 앞서 시도 안 했을 가능성이 높은 각도부터 최대
 *   MAX_ANGLE_RETRIES회 더 조사한다.
 */
export async function verifyExcerpt(
  target: VerificationTarget,
  queryTemplates: QueryTemplate[] = BOOK_EXCERPT_QUERY_TEMPLATES
): Promise<VerificationResult> {
  console.log(`[verifyExcerpt] target=${JSON.stringify(target)}`);

  try {
    const firstPrompt = buildInvestigationPrompt(target, queryTemplates);
    const firstInvestigation = await runInvestigation(firstPrompt);
    const firstResult = await judge(firstInvestigation);
    if (firstResult.verified) return firstResult;

    const queriesTried: string[] = [...firstInvestigation.queriesTried];

    if (firstInvestigation.queriesTried.length === 0) {
      console.warn(`[verifyExcerpt] 검색 도구를 한 번도 호출 안 함 — 강하게 재지시하여 1회 재시도`);
      const retryPrompt = buildInvestigationPrompt(
        target,
        queryTemplates,
        `【다시 한번 강조 — 반드시 지킬 것】 방금 검색 도구를 한 번도 호출하지 않고 답하려 했다. ` +
          `이번에는 반드시 아래 검색어 중 최소 하나를 실제로 호출한 뒤에만 결론을 내릴 것.`
      );
      const retryInvestigation = await runInvestigation(retryPrompt);
      const retryResult = await judge(retryInvestigation);
      queriesTried.push(...retryInvestigation.queriesTried);
      if (retryResult.verified) return { ...retryResult, queriesTried };
      console.warn(`[verifyExcerpt] 재시도 후에도 검증 실패 — 시도한 검색어 전체: ${JSON.stringify(queriesTried)}`);
      return { verified: false, queriesTried };
    }

    for (let attempt = 1; attempt <= MAX_ANGLE_RETRIES; attempt++) {
      console.warn(
        `[verifyExcerpt] 조사 실패(검색은 했음, 각도를 바꿔 ${attempt}/${MAX_ANGLE_RETRIES}차 재시도) — ` +
          `지금까지 시도한 검색어: ${JSON.stringify(queriesTried)}`
      );
      const retryTemplates = rotate(queryTemplates, Math.ceil((queryTemplates.length * attempt) / (MAX_ANGLE_RETRIES + 1)));
      const retryPrompt = buildInvestigationPrompt(
        target,
        retryTemplates,
        `【재시도 — 반드시 다른 검색으로 시도할 것】 방금 이 검색어들로 조사했지만(${queriesTried
          .map((q) => `'${q}'`)
          .join(", ")}) 원문을 찾지 못했다. 이번에는 같은 검색어를 반복하지 말고, 아래 새로운 순서의 ` +
          `검색어부터 다른 각도로 다시 조사할 것.`
      );
      const retryInvestigation = await runInvestigation(retryPrompt);
      const retryResult = await judge(retryInvestigation);
      queriesTried.push(...retryInvestigation.queriesTried);
      if (retryResult.verified) return { ...retryResult, queriesTried };
    }

    console.warn(`[verifyExcerpt] ${MAX_ANGLE_RETRIES}회 각도 재시도 후에도 검증 실패 — 시도한 검색어 전체: ${JSON.stringify(queriesTried)}`);
    return { verified: false, queriesTried };
  } catch (err) {
    console.error("[verifyExcerpt] 검증 호출 실패", err);
    return { verified: false, queriesTried: [] };
  }
}

// ============================================================================
// 저자/발행 주체 대조 — 실제로 발견된 버그: 인용구 검증(verifyExcerpt)은
// "이 문장이 이 페이지에 노출됐는가"만 확인할 뿐, "이 페이지에 적힌 저자가
// studed가 표기하려는 저자와 실제로 일치하는가"는 한 번도 대조하지 않았다.
// 그래서 검색된 서지정보 페이지가 실존하고 각주까지 정상적으로 붙었는데도,
// 그 페이지에 적힌 진짜 저자와는 다른 이름(모델이 지어내거나 다른 책과
// 혼동한 이름)이 studed 결과물에 그대로 나가는 사고가 실제로 있었다(『내가
// 원하는 것을 나도 모를 때』를 "김나이" 저작으로 표기 — 실제 저자는 전승환).
// 이 섹션은 그 구멍을 메우는 별도의 검증 축이다 — "원문 노출"이 아니라
// "속성(저자 등) 일치"를 확인하므로 judge()/VerificationResult와는 다른
// 결과 형태가 필요하다.
// ============================================================================

export interface AttributionVerificationResult {
  /** "confirmed_match": 검색으로 확인된 실제 저자와 studed가 표기하려는 이름이
   * 일치. "confirmed_mismatch": 검색으로 실제 저자를 확인했는데 다름(자동
   * 정정 가능한 명확한 경우). "inconclusive": 검색으로 저자 자체를 확인
   * 못함(있는지 없는지 판단 불가 — 잘못됐다고 단정할 근거가 없으므로 그대로
   * 둔다). */
  status: "confirmed_match" | "confirmed_mismatch" | "inconclusive";
  /** status가 confirmed_mismatch일 때 검색으로 확인된 실제 이름. */
  confirmedAttribution?: string;
  source?: { title: string; url: string };
  queriesTried: string[];
}

// "전승환 지음", "전승환(지은이)", "전승환 저" 처럼 흔한 접미사가 붙어도
// 같은 인물로 인식하도록 정리한다 — 이름 자체의 표기 차이(예: 띄어쓰기)에만
// 관대할 뿐, 실제로 다른 이름까지 같다고 우기지는 않는다.
export function normalizeAttributionName(name: string): string {
  return name
    .replace(/\s+/g, "")
    .replace(/(지음|지은이|엮음|엮은이|옮김|옮긴이|글|그림|저자|저)$/g, "")
    .toLowerCase();
}

function buildAttributionInvestigationPrompt(workTitle: string, extraNote?: string): string {
  const queries = [
    `"${workTitle}" 저자`,
    `"${workTitle}" 지은이`,
    `"${workTitle}" 책 소개`,
    `"${workTitle}" 서지정보`,
  ];
  return `
너는 서지정보 검증을 위해 실제로 조사하는 리서처다. 아래 자료의 "저자/지은이가
실제로 누구인지"를 확인하는 것이 유일한 임무다 — 다른 작업은 하지 않는다.

[확인할 대상] ${workTitle}
${extraNote ? `\n${extraNote}\n` : ""}
【검색 도구를 실제로 호출할 것 — 매우 중요】 반드시 실시간 웹 검색 도구를 최소
한 번 이상 실제로 호출해서 확인할 것. 이미 아는 책이라고 생각되더라도 예외 없이
검색으로 재확인한 뒤 결론 낼 것 — 검색 없이 기억만으로 답하는 것은 이 조사에서
아무 의미가 없다.

시도해볼 검색어(순서대로 — 앞선 검색어에서 이미 확인됐으면 뒤는 생략해도 된다):
${queries.map((q, i) => `${i + 1}. ${q}`).join("\n")}

서점(교보문고/알라딘/예스24 등), 출판사 공식 페이지, 도서관 서지정보처럼
"제목 + 저자 + 출판사" 조합이 함께 명시된 페이지를 근거로 삼을 것 — 위키형
(나무위키 등)이나 동영상 페이지만으로는 결론 내리지 말 것(자유 편집이거나
원문 대조가 불가능해서 신뢰도가 낮다).

조사한 내용과 결론을 자유롭게 서술할 것 — 형식은 정해져 있지 않다. 어떤
검색어로 무엇을 확인했는지, 서지정보 페이지에 적힌 저자 이름이 정확히
무엇인지를 분명하게 밝힐 것.
`.trim();
}

export const ATTRIBUTION_EXTRACT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    found: {
      type: Type.BOOLEAN,
      description: "조사자가 서지정보 페이지에서 저자를 명확히 확인했으면 true, 못 찾았거나 애매하면 false",
    },
    author: { type: Type.STRING, description: "확인된 저자 이름 그대로. 없으면 빈 문자열." },
    sourceTitle: { type: Type.STRING, description: "그 페이지의 제목이나 사이트 이름. 없으면 빈 문자열." },
  },
  required: ["found", "author", "sourceTitle"],
};

async function extractAttributionOutcome(
  investigationText: string
): Promise<{ found: boolean; author?: string; sourceTitle?: string }> {
  const resp = await generate({
      label: "verifyAuthorAttribution:extract",
      role: "lite",
      prompt: `아래는 어떤 조사자가 서지정보(저자) 검증을 위해 웹 검색을 하고 남긴 리서치 메모다. 이 메모를 읽고 구조화된 결론을 뽑아줘.\n\n[리서치 메모]\n${investigationText}`,
      schema: ATTRIBUTION_EXTRACT_SCHEMA,
    });
  const raw = resp.text;
  if (!raw) return { found: false };
  const parsed = JSON.parse(raw) as { found: boolean; author: string; sourceTitle: string };
  return { found: parsed.found, author: parsed.author || undefined, sourceTitle: parsed.sourceTitle || undefined };
}

/**
 * studed가 표기하려는 저자/지은이명이 실제 서지정보와 일치하는지 확인한다.
 * verifyExcerpt()와 같은 2단계 패턴(①그라운딩 켠 자유 서술 조사 → ②그라운딩
 * 없이 구조화 추출)과 같은 검색-스킵 방어(강하게 재지시 1회 재시도)를 쓴다.
 * "책 존재는 확인됐다"와 "이 책의 저자가 이 이름이 맞다"는 서로 다른 주장이라
 * 별도로 검증해야 한다는 게 이 함수가 존재하는 이유다.
 */
export async function verifyAuthorAttribution(
  workTitle: string,
  claimedAttribution: string
): Promise<AttributionVerificationResult> {
  console.log(`[verifyAuthorAttribution] workTitle=${workTitle} claimedAttribution=${claimedAttribution}`);

  try {
    let investigation = await runInvestigation(buildAttributionInvestigationPrompt(workTitle));

    if (investigation.queriesTried.length === 0) {
      console.warn(`[verifyAuthorAttribution] 검색 도구를 한 번도 호출하지 않음 — 강하게 재지시하여 1회 재시도`);
      investigation = await runInvestigation(
        buildAttributionInvestigationPrompt(
          workTitle,
          `【다시 한번 강조 — 반드시 지킬 것】 방금 검색 도구를 한 번도 호출하지 않고 답하려 했다. ` +
            `이번에는 반드시 위 검색어 중 최소 하나를 실제로 호출한 뒤에만 결론을 내릴 것.`
        )
      );
    }

    if (investigation.queriesTried.length === 0) {
      console.warn(`[verifyAuthorAttribution] 재시도에서도 검색 도구를 호출하지 않음 — 판단 불가로 처리`);
      return { status: "inconclusive", queriesTried: [] };
    }

    const outcome = await extractAttributionOutcome(investigation.text);
    const firstTrustworthyChunk = investigation.chunks.find((c) => c.web?.uri && !isWeakQuoteSource(c.web.uri));

    if (!outcome.found || !outcome.author || !firstTrustworthyChunk?.web?.uri) {
      console.warn(
        `[verifyAuthorAttribution] 저자를 확인하지 못함(판단 불가로 처리) — 시도한 검색어: ${JSON.stringify(investigation.queriesTried)}`
      );
      return { status: "inconclusive", queriesTried: investigation.queriesTried };
    }

    // title 우선순위는 verifyExcerpt()의 judge()와 동일한 이유로 도메인 표기
    // (firstTrustworthyChunk.web.title)를 우선한다 — 화면에 노출될 경우 다른
    // 출처들과 표기 형식을 맞추기 위함.
    const source = {
      title: firstTrustworthyChunk.web.title || outcome.sourceTitle || firstTrustworthyChunk.web.uri,
      url: firstTrustworthyChunk.web.uri,
    };
    const isMatch = normalizeAttributionName(outcome.author) === normalizeAttributionName(claimedAttribution);
    if (isMatch) {
      return { status: "confirmed_match", queriesTried: investigation.queriesTried, source };
    }
    console.warn(
      `[verifyAuthorAttribution] 저자 불일치 발견: studed 표기="${claimedAttribution}" 실제 확인="${outcome.author}" source=${source.url}`
    );
    return { status: "confirmed_mismatch", confirmedAttribution: outcome.author, source, queriesTried: investigation.queriesTried };
  } catch (err) {
    console.error("[verifyAuthorAttribution] 검증 호출 실패", err);
    return { status: "inconclusive", queriesTried: [] };
  }
}
