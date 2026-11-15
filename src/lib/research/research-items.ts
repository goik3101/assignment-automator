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
  // "주제 또는 상품"처럼 둘 중 하나를 고르는 항목은 어느 쪽 소제목이든 있으면 된다(만평이면 "주제", 광고면 "상품" — 실측 2026-10-24 불필요한 계획 재작성).
  const alts = item.split(/\s+(?:또는|혹은)\s+/).filter(Boolean);
  if (alts.length > 1) return alts.some((alt) => itemMatchesHeading(alt, heading));
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
/**
 * 표의 **머리줄 칸**(과 첫 열의 값)도 "그 항목을 다뤘다"로 센다.
 *
 * 왜(2026-11-11): 양식이 표인 칸은 필수 항목이 소제목이 아니라 **열**이다. 소제목만 찾으면
 * 수학 "분석적 채점 기준표"가 표를 제대로 썼는데도 항목 5개 전부 누락으로 잡혀, 멀쩡한 표를
 * 다시 쓰게 하는 보완 호출이 돌았다(시간 45.6초).
 */
function tableHeadings(content: string): string[] {
  const lines = content.split("\n").map((l) => l.trim());
  const out: string[] = [];
  for (let i = 0; i + 2 < lines.length + 1; i++) {
    if (!/^\|.*\|$/.test(lines[i] ?? "")) continue;
    if (!/^\|[\s:|-]+\|$/.test(lines[i + 1] ?? "")) continue;
    const body = lines.slice(i + 2).filter((l) => /^\|.*\|$/.test(l));
    if (body.length === 0) continue;
    const cells = (s: string) => s.split("|").map((c) => c.trim()).filter(Boolean);
    out.push(...cells(lines[i] ?? ""));
    // 첫 열의 값도 항목 이름일 수 있다(줄이 "사례1"·"합계"인 표).
    out.push(...body.map((r) => cells(r)[0] ?? "").filter(Boolean));
  }
  return out;
}

// 이름·제목·명칭을 적는 칸은 한두 낱말이 정상이다 — 12자 미만이라고 비었다고 하면 거짓 경고다(2026-11-16, 값 칸을 값만 남기게 한 뒤 가정-01에서 드러남).
const SHORT_VALUE_ITEM = /명칭|이름|제목|저자|지은이|출판사|서명|도서/;

export function findMissingItems(content: string, requiredItems: string[]): string[] {
  const blocks = splitByH3(content);
  const heads = tableHeadings(content);
  const inline = inlineLabelBodies(content, requiredItems);
  return requiredItems.filter((item) => {
    if (heads.some((h) => itemMatchesHeading(item, h))) return false;
    const minChars = SHORT_VALUE_ITEM.test(item) ? 1 : MIN_ITEM_BODY_CHARS;
    // 이름이 정확히 같은 소제목을 먼저 본다. 낱말 겹침만으로 맞추면 "효과적인 정책 설명"이 "효과적인 정책 명칭" 칸(짧은 값)에 걸려
    // 멀쩡한 칸이 비었다고 나온다. 겹침으로만 맞는 칸이 여럿이면 본문이 가장 긴 것을 쓴다.
    const exact = blocks.find((b) => normalizeKey(b.heading) === normalizeKey(item));
    const fuzzy = blocks.filter((b) => itemMatchesHeading(item, b.heading)).sort((x, y) => y.body.length - x.body.length)[0];
    const block = exact ?? fuzzy;
    if (!block) {
      // 소제목 대신 "질문1: …" 꼴로 칸 이름을 글 안에 적은 경우도 채운 것이다.
      const body = inline.get(item);
      return body === undefined || visibleLength(body) < minChars;
    }
    return visibleLength(block.body) < minChars;
  });
}

/**
 * "질문1: …  답변1: …"처럼 **소제목 없이 칸 이름 + 쌍점**으로 쓴 항목의 본문을 찾는다.
 *
 * 왜(2026-11-16, 사용자가 쓴 한국사 신문 결과물34): 양식지 그대로 "질문1: … 답변1: …"을 한 문단에 이어 썼는데
 * 소제목(###)만 찾는 검사가 항목 5개를 전부 "비어 있어요"로 경고했다. 질문·답변이 다 있는 글에 붙는 거짓 경고라
 * 학생이 멀쩡한 글을 의심하게 된다. 칸 이름 뒤 쌍점이 있는 곳부터 다음 칸 이름 앞까지를 그 항목의 본문으로 본다.
 */
function inlineLabelBodies(content: string, items: string[]): Map<string, string> {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const labelRe = (item: string) =>
    new RegExp(`(?:^|[\\s>*_(])${[...item.replace(/\s+/g, "")].map(esc).join("\\s*")}[*_]*\\s*[:：]`, "m");
  const found = items
    .flatMap((item) => item.split(/\s+(?:또는|혹은)\s+/).map((alt) => ({ item, alt })))
    .map(({ item, alt }) => {
      const m = labelRe(alt).exec(content);
      return m ? { item, start: m.index, end: m.index + m[0].length } : null;
    })
    .filter((x): x is { item: string; start: number; end: number } => x !== null)
    .sort((a, b) => a.start - b.start);
  const out = new Map<string, string>();
  found.forEach((f, i) => {
    if (!out.has(f.item)) out.set(f.item, content.slice(f.end, i + 1 < found.length ? found[i + 1].start : content.length));
  });
  return out;
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

/**
 * 글이 "### 문항 1 … ### 문항 4"처럼 **번호 붙은 문항 소제목**으로 짜여 있는가.
 *
 * 왜(2026-11-16 가정-03, 지필 범위 공지): 안내문이 "총 4문항"과 범위 주제 6개를 함께 말해 필수 항목(주제 6개)이 소제목으로 안 나오고
 * 문항 번호 소제목 4개로 나왔다. 글은 멀쩡한데 "항목 6개가 비어 있어요"가 찍혔다 — 이 모양에서 항목은 소제목이 아니라 문항 안에서 다룰 주제다.
 */
export function isOrganizedByQuestionNumbers(content: string): boolean {
  return splitByH3(content).filter((b) => /^(?:문항|문제|질문)\s*\d+/.test(b.heading.replace(/\*+/g, "").trim())).length >= 2;
}
