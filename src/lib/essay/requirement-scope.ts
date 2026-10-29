// 안내문 요구사항·작성 기준(writing_guide)을 "어느 단계에 적용되는가"로 나눈다.
// 실측(2026-10-28, 실제 안내문 생성): 요구사항 전체가 모든 단계 프롬프트에 그대로 들어가 "발표 시간 2분30초~3분", "대본 없이 발표", "찬반 세트 순서"가
// 개요에 "도입 15~20초, 찬성 60초" 같은 발표 시간표로 섞였다. 반대로 그림 종류·장면 수처럼 특정 결과물의 제출 조건은 그 단계에 정확히 가야 한다.
// 전역으로 지우지 않고 문장마다 적용 단계를 정한다: 이름을 언급한 단계 → 그 단계, 그림·장면 → 장면 산출물 단계, 근거·출처 → 근거를 쓰는 단계,
// 발표·대본·청중 → 발표를 만드는 단계(없으면 어느 생성 단계에도 주지 않는다), 나머지는 공통.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

export interface ScopeElement {
  label: string;
  description: string;
  required_items?: string[];
}

export interface ScopedStatements {
  /** 모든 단계에 공통으로 주는 문장 */
  shared: string[];
  /** 해당 단계에만 주는 문장(단계 이름 → 문장) */
  byLabel: Record<string, string[]>;
  /** 이번에 만드는 단계의 어디에도 주지 않는 문장(발표 방식처럼 만들지 않는 결과물의 조건) */
  withheld: string[];
}

const norm = (s: string) => s.replace(/[\s()\[\]{}<>"'`·・,.:;!?~\-–—/]/g, "").toLowerCase();

/** 줄 목록을 문장 단위로 쪼갠다(한 줄에 여러 문장이 있으면 문장마다 적용 단계가 다를 수 있다). */
export function splitStatements(lines: string[]): string[] {
  return lines
    .flatMap((l) => (l ?? "").split(/(?<=[.。!?])\s+|\n+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

// 발표·말하기·청중 쪽 조건(만들 글이 아니라 학생이 수업에서 수행하는 것).
const PERFORMANCE =
  /발표\s*(?:시간|방식|방법|순서|시\s)|발표는|발표를\s*(?:하|진행)|대본|스크립트|제비뽑기|청중|듣기\s*활동|경청|동료\s*평가|찬성\s*먼저|반대\s*바로|찬반[을은]?\s*세트|개인용\s*시계|말하기\s*(?:시간|평가)|수업\s*중\s*직접|직접\s*수행/;
const PERFORMANCE_OWNER_LABEL = /발표|말하기|스피치|연설|토론|대본/;
// 그림·장면·제목 형식 조건.
const VISUAL_CUE = /장면|컷|칸|그림|그래프|이미지|시각|제목|키워드/;
const VISUAL_OWNER = /스토리보드|콘티|카드\s*뉴스|카드|만화|웹툰|영상|시나리오|그림|컷|장면|슬라이드|PPT|포스터|인포그래픽/;
// 근거·출처 조건.
const EVIDENCE_CUE = /근거|출처|인용|자료\s*(?:수집|조사)/;
const EVIDENCE_OWNER = /근거|출처|자료\s*(?:수집|조사)|인용/;

function ownersByLabelThenText(elements: ScopeElement[], labelRe: RegExp, textRe: RegExp): ScopeElement[] {
  const byLabel = elements.filter((e) => labelRe.test(e.label));
  return byLabel.length > 0 ? byLabel : elements.filter((e) => textRe.test(`${e.description} ${(e.required_items ?? []).join(" ")}`));
}

/**
 * 문장마다 적용 단계를 정한다. all은 이 과제의 모든 단계(이름 언급 판정용), generated는 이번에 실제로 만드는 단계 이름 —
 * 만들지 않는 단계에만 해당하는 조건은 withheld로 빠진다.
 */
export function scopeStatements(statements: string[], all: ScopeElement[], generated: string[]): ScopedStatements {
  const out: ScopedStatements = { shared: [], byLabel: {}, withheld: [] };
  const gen = new Set(generated);
  const give = (s: string, targets: ScopeElement[]) => {
    const hit = targets.filter((e) => gen.has(e.label));
    if (hit.length === 0) {
      out.withheld.push(s);
      return;
    }
    for (const e of hit) (out.byLabel[e.label] ??= []).push(s);
  };
  const perfOwners = all.filter((e) => PERFORMANCE_OWNER_LABEL.test(e.label));
  const visualOwners = ownersByLabelThenText(all, VISUAL_OWNER, VISUAL_OWNER);
  const evidenceOwners = ownersByLabelThenText(all, /(?!)/, EVIDENCE_OWNER);

  // 앞 문장을 받아 쓰는 문장("8개가 기본이며 10개까지 가능함", "부족하면 감점된다")은 앞 문장과 같은 단계에 붙인다.
  const CONTINUATION = /^(?:\d+\s*(?:개|가지|장|분|초)|이는|이것은|그\s|단[,\s]|부족하면|또한|그리고)/;
  let prev: { targets: ScopeElement[] } | "withheld" | null = null;
  for (const s of statements) {
    const text = norm(s);
    const mentioned = all.filter((e) => norm(e.label).length >= 2 && text.includes(norm(e.label)));
    let targets: ScopeElement[] | null = null; // null = 공통
    let withhold = false;
    if (mentioned.length > 0) {
      // "개요에서 생성한 내용을 바탕으로 8개의 장면으로 스토리보드를 작성한다"처럼 두 단계를 함께 말해도, 장면·그림 조건은 장면 산출물의 것이다.
      const visual = mentioned.length > 1 && VISUAL_CUE.test(s) ? mentioned.filter((e) => visualOwners.includes(e)) : [];
      targets = visual.length > 0 ? visual : mentioned;
    } else if (PERFORMANCE.test(s)) {
      if (perfOwners.length > 0) targets = perfOwners;
      else withhold = true;
    } else if (VISUAL_CUE.test(s)) {
      if (visualOwners.length > 0) targets = visualOwners;
    } else if (EVIDENCE_CUE.test(s)) {
      if (evidenceOwners.length > 0) targets = evidenceOwners;
    } else if (CONTINUATION.test(s) && prev) {
      if (prev === "withheld") withhold = true;
      else targets = prev.targets;
    }
    if (withhold) {
      out.withheld.push(s);
      prev = "withheld";
    } else if (targets) {
      give(s, targets);
      prev = { targets };
    } else {
      out.shared.push(s);
      prev = null;
    }
  }
  return out;
}

const hasScopes = (s: ScopedStatements) => Object.values(s.byLabel).some((l) => l.length > 0);

/** 한 단계 프롬프트용: 공통 + 그 단계 문장을 한 목록으로. */
export function scopedLinesFor(label: string, lines: string[], all: ScopeElement[], generated: string[]): string[] {
  if (all.length <= 1) return lines.filter(Boolean); // 단계가 하나면 섞일 일이 없다 — 나누지 않는다
  const s = scopeStatements(splitStatements(lines), all, generated);
  return [...s.shared, ...(s.byLabel[label] ?? [])];
}

/** 여러 단계를 한 프롬프트에 쓰는 완성 원고용 "[요구사항]" 본문. 공통과 단계별을 구분해 보여 준다. */
export function renderScopedRequirements(lines: string[], all: ScopeElement[], generated: string[]): string {
  if (all.length <= 1) return lines.filter(Boolean).map((l) => `- ${l}`).join("\n") || "(명시된 요구사항 없음)";
  const s = scopeStatements(splitStatements(lines), all, generated);
  const parts: string[] = [];
  if (s.shared.length > 0) parts.push(s.shared.map((l) => `- ${l}`).join("\n"));
  if (hasScopes(s)) {
    parts.push(
      "[단계별 요구사항 — 해당 단계에만 적용하고 다른 단계에는 섞지 말 것]\n" +
        generated
          .filter((g) => (s.byLabel[g]?.length ?? 0) > 0)
          .map((g) => `- "${g}" 단계: ${s.byLabel[g].join(" ")}`)
          .join("\n")
    );
  }
  return parts.join("\n") || "(명시된 요구사항 없음)";
}

/** 작성 기준(writing_guide)도 같은 규칙으로 나눠 한 문단으로. 비어 있으면 빈 문자열. */
export function renderScopedGuide(guide: string | undefined, all: ScopeElement[], generated: string[]): string {
  if (!guide?.trim()) return "";
  if (all.length <= 1) return guide.trim();
  const s = scopeStatements(splitStatements([guide]), all, generated);
  const lines: string[] = [];
  if (s.shared.length > 0) lines.push(s.shared.join(" "));
  for (const g of generated) if ((s.byLabel[g]?.length ?? 0) > 0) lines.push(`"${g}" 단계: ${s.byLabel[g].join(" ")}`);
  return lines.join("\n");
}
