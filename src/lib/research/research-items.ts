// 수행평가 안내문의 "필수 항목"(TaskElement.required_items)을 기준으로 결과물의
// 구조를 검사·분해하는 순수 문자열 유틸. LLM을 부르지 않는다 — 모델이 텍스트를
// 다시 옮겨 적다가 글자를 빠뜨린 과거 사고(generate-essay.ts의
// splitAnnotatedIntoSections 설명 참고) 이후 확립한 원칙대로, 검사와 분해는 전부
// 코드가 원문에서 직접 한다. 특정 과제(인권 선구자 등)에 대한 하드코딩은 없다 —
// 항목 목록은 항상 안내문 분석에서 동적으로 온다.

export interface ResearchItem {
  item: string;
  lines: string[];
}

const H3_LINE = /^###(?!#)[ \t]*(.+?)[ \t]*$/gm;

/** 항목명 비교용 정규화 — 공백·구두점·괄호 제거, 소문자화. */
function normalizeKey(s: string): string {
  return s.replace(/[\s·・,.:;()[\]「」『』"'“”‘’\-–—/*_~#]/g, "").toLowerCase();
}

const TRAILING_PARTICLE = /(?:에서|으로|에게|에|의|은|는|이|가|을|를|과|와|도|로)$/;

/** "인권에 미친 영향" → ["인권","미친","영향"] — 소제목이 항목명을 약간 다르게
 * 꾸며 써도(예: "인권 발달에 미친 영향") 매칭되게 하는 핵심 단어 목록. */
function coreTokens(item: string): string[] {
  return item
    .split(/[\s·,/()]+/)
    .map((t) => (t.length > 2 ? t.replace(TRAILING_PARTICLE, "") : t))
    .filter((t) => t.length >= 2);
}

export function itemMatchesHeading(item: string, heading: string): boolean {
  const a = normalizeKey(item);
  const b = normalizeKey(heading);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const tokens = coreTokens(item);
  if (tokens.length === 0) return false;
  const hits = tokens.filter((t) => b.includes(normalizeKey(t))).length;
  return hits >= Math.max(1, Math.ceil(tokens.length * 0.6));
}

/** "### 소제목" 기준으로 본문을 나눈다. 첫 "###" 이전 텍스트는 버린다. */
export function splitByH3(content: string): { heading: string; body: string }[] {
  const re = new RegExp(H3_LINE.source, "gm");
  const marks: { heading: string; start: number; bodyStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    marks.push({ heading: m[1], start: m.index, bodyStart: m.index + m[0].length });
  }
  return marks.map((mark, i) => ({
    heading: mark.heading,
    body: content.slice(mark.bodyStart, i + 1 < marks.length ? marks[i + 1].start : content.length).trim(),
  }));
}

/** 각주·불릿·마크다운 기호를 빼고 실제로 읽히는 글자만 센다. */
function visibleLength(body: string): number {
  return body
    .replace(/\[\d+\]/g, "")
    .replace(/[-*•>#|]/g, "")
    .replace(/\s+/g, "")
    .length;
}

const MIN_ITEM_BODY_CHARS = 12;

/**
 * 필수 항목 중 (1) 대응하는 "###" 소제목이 없거나 (2) 소제목은 있는데 본문이
 * 사실상 비어 있는 항목을 돌려준다. 모든 항목이 있으면 빈 배열.
 */
export function findMissingItems(content: string, requiredItems: string[]): string[] {
  const blocks = splitByH3(content);
  return requiredItems.filter((item) => {
    const block = blocks.find((b) => itemMatchesHeading(item, b.heading));
    if (!block) return true;
    return visibleLength(block.body) < MIN_ITEM_BODY_CHARS;
  });
}

/** 조사 자료 markdown을 항목(### 소제목)별 사실 줄 목록으로 분해한다. */
export function parseResearchItems(content: string): ResearchItem[] {
  return splitByH3(content)
    .map(({ heading, body }) => ({
      item: heading,
      lines: body
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    }))
    .filter((it) => it.lines.length > 0);
}

const YEAR_PATTERN = /(?<!\d)(1[0-9]{3}|20[0-9]{2})\s*년/g;

/** 본문에 등장하는 4자리 연도(1000~2099)를 중복 없이 뽑는다. */
export function extractYears(text: string): string[] {
  const years = new Set<string>();
  for (const m of text.matchAll(YEAR_PATTERN)) years.add(m[1]);
  return [...years].sort();
}

/** candidate 본문에 있는 연도 중 조사 자료(researchText)에 없는 것들. 조사 자료에
 * 연도가 하나도 없으면(비교 기준 자체가 없으면) 검사하지 않고 빈 배열. */
export function yearsMissingFromResearch(candidateText: string, researchText: string): string[] {
  const known = new Set(extractYears(researchText));
  if (known.size === 0) return [];
  return extractYears(candidateText).filter((y) => !known.has(y));
}
