// 문장 ↔ 출처 페이지 근거 확인. "링크가 열린다"와 "그 페이지가 이 문장을 뒷받침한다"는 다르다 — 문장에서 코드가 대조할 수 있는 표지(연도·수치·영문 고유명)만
// 뽑아 인용한 페이지 본문에 실제로 있는지 본다. 한국어 서술의 의미까지는 판단하지 못한다(그건 사람이 링크를 열어 확인해야 한다).
// alias import 없음 — node:test에서 바로 불러올 수 있게.

export type PageTexts = Map<number, string | null>;

/**
 * 읽은 출처 페이지에서 값을 못 찾아 각주를 지운 문장 뒤에 남기는 표시. "거짓"이 아니라 "확인 필요"다 — 값이 이미지·다른 표기("10명 중 4명")로 있거나,
 * 페이지 본문이 잘렸거나, 문장이 다른 출처의 내용일 수 있어서 코드는 틀렸다고 단정하지 못한다. 학생이 직접 확인하면 지운다.
 */
export const UNVERIFIED_MARK = "[확인 필요]";

// 사실 주장이 아니라 학생의 의견·계획·제안을 말하는 문장(수치가 들어 있어도 "이렇게 하겠다/제안한다"는 말이라 확인 필요 표시를 붙이지 않는다).
// 한계: 사실 주장을 "~필요하다"로 끝내는 문장도 여기 걸려 표시가 빠질 수 있다(미탐) — 표시는 학생의 확인을 돕는 용도라 놓치는 쪽이 덜 해롭다.
const OPINION_OR_PLAN =
  /(?:^|[\s"“(])(?:나는|내가|나도|저는|제가)|(?:생각한다|생각했다|생각된다|느꼈다|느낀다|바란다|다짐한다|제안한다|권한다|권고한다|예정이다|계획이다|하려\s*한다|할\s*것이다|해야\s*한다|필요하다)[.!?]?\s*$/;

export function isOpinionOrPlan(text: string): boolean {
  return OPINION_OR_PLAN.test(text.trim());
}

/** 대조할 수 있는 표지가 하나도 없는 문장은 검사 대상이 아니다. */
export interface CheckTokens {
  numbers: string[];
  names: string[];
}

// "1930년대"는 연도가 아니라 연대다 — 페이지에는 1938·1941처럼 구체적인 해만 적혀 있어 "1930"을 못 찾고 멀쩡한 문장이 걸린다(국어-01 실측 2026-11-21).
const YEAR = /(?<![\d.,])(1[0-9]{3}|20[0-9]{2})(?![\d])(?!\s?년대)/g;
const BIG_NUMBER = /(?<![\d.])\d{1,3}(?:,\d{3})+(?![\d])|(?<![\d.])\d+(?:\.\d+)?\s?%/g;
const LATIN_NAME = /\b[A-Z][A-Za-z'’-]{2,}(?:\s+[A-Z][A-Za-z'’-]{2,})*\b/g;
// 영문 약어·머리글자라 거의 모든 페이지에 있거나 의미가 없는 것들은 표지로 쓰지 않는다.
const NAME_STOP = new Set(["The", "And", "For", "With", "From", "That", "This"]);

// "35만 명"·"1.7억"·"3,500만 건"처럼 한국어 단위가 붙은 큰 수. 쉼표 큰 수·% 규칙은 "3,500만"의 "3,500"만 잡아 단위를 잃었다(역사-01 실측: "약 35만 명"이 아무 검사도 못 받았다).
// "조"는 뺀다 — "개인정보 보호법 제46조"의 조항 번호가 1조(10^12)로 읽혀 거짓 경고가 났다(사회-05 실측 2026-11-21). 조 단위 금액은 이 과제들에서 드물다.
// 표지는 "35만"처럼 원문 표기 그대로 두고, 페이지 대조는 pageSupports가 단위를 풀어서 한다.
const UNIT_NUMBER = /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(만|억)(?!큼)/g;
const UNIT_MULT: Record<string, number> = { 만: 1e4, 억: 1e8, 조: 1e12 };
// "61.8cm"·"2.5kg"처럼 단위가 붙은 소수(길이·무게·온도·넓이). 소수가 아닌 정수 측정값("30km")은 어느 페이지에나 있는 숫자와 겹쳐 변별력이 없어 뺀다.
// 같은 값이 페이지에 단위 낱말 없이도("61.8 센티미터") 적히므로 숫자만 ±2%로 찾는다.
const MEASURE_NUMBER = /(?<![\d.,])(\d+\.\d+)\s?(cm|mm|km|kg|ml|℃|㎡|m²)(?![A-Za-z])/g;
const MEASURE_TOKEN = /^(\d+\.\d+)(cm|mm|km|kg|ml|℃|㎡|m²)$/;
const MEASURE_TOLERANCE = 0.02;
const UNIT_TOKEN = /^(\d+(?:\.\d+)?)(만|억|조)$/;

export function extractCheckTokens(sentence: string, opts: { units?: boolean } = {}): CheckTokens {
  let s = sentence.replace(/\[\d+\]/g, " ");
  const numbers = new Set<string>();
  if (opts.units) {
    // 단위 수는 따로 뽑고 문장에서 지운다 — 안 지우면 BIG_NUMBER가 "3,500만"에서 "3500"을 또 뽑아 페이지에 "3500"이 있어야만 통과하게 된다.
    s = s.replace(UNIT_NUMBER, (_m, num: string, unit: string) => {
      numbers.add(`${num.replace(/,/g, "")}${unit}`);
      return " ";
    });
    s = s.replace(MEASURE_NUMBER, (_m, num: string, unit: string) => {
      numbers.add(`${num}${unit}`);
      return " ";
    });
  }
  for (const m of s.matchAll(YEAR)) numbers.add(m[1]);
  for (const m of s.matchAll(BIG_NUMBER)) numbers.add(m[0].replace(/[,\s]/g, ""));
  const names = new Set<string>();
  for (const m of s.matchAll(LATIN_NAME)) if (!NAME_STOP.has(m[0])) names.add(m[0]);
  return { numbers: [...numbers].slice(0, 6), names: [...names].slice(0, 4) };
}

function norm(text: string): string {
  // 쉼표 뒤가 세 자리면 천 단위 구분이다. 예전 식은 "1,700,000"에서 앞 쌍만 풀어 "1700,000"을 남겼다.
  return text.toLowerCase().replace(/(\d),(?=\d{3})/g, "$1").replace(/\s+/g, " ");
}

// 페이지 글에서 "값"을 모두 뽑는다: 숫자 자체, 그리고 뒤에 단위(만·万·million·billion·thousand …)가 붙은 숫자는 곱해서.
const PAGE_NUMBER = /(\d+(?:\.\d+)?)\s?(만|萬|万|억|億|조|兆|million|billion|trillion|thousand)?/g;
const PAGE_MULT: Record<string, number> = { 만: 1e4, 萬: 1e4, 万: 1e4, 억: 1e8, 億: 1e8, 조: 1e12, 兆: 1e12, million: 1e6, billion: 1e9, trillion: 1e12, thousand: 1e3 };
// 한국어 글은 "약 35만 명"처럼 반올림해 쓰고 출처는 "346,000"처럼 정확한 값을 적는다 — 그래서 단위 수는 ±5% 안의 값이 페이지에 있으면 뒷받침으로 본다.
// 틀린 경고(멀쩡한 문장에 [확인 필요])가 놓치는 것보다 해로우므로 넉넉한 쪽이다.
const UNIT_TOLERANCE = 0.05;

function measureSupported(token: string, normalizedPage: string): boolean {
  const target = Number(MEASURE_TOKEN.exec(token)?.[1]);
  if (!Number.isFinite(target) || target <= 0) return true;
  for (const pm of normalizedPage.matchAll(/\d+(?:\.\d+)?/g)) {
    if (Math.abs(Number(pm[0]) - target) <= target * MEASURE_TOLERANCE) return true;
  }
  return false;
}

function unitSupported(token: string, normalizedPage: string): boolean {
  if (MEASURE_TOKEN.test(token)) return measureSupported(token, normalizedPage);
  const m = UNIT_TOKEN.exec(token);
  if (!m) return normalizedPage.includes(token.toLowerCase());
  const target = Number(m[1]) * UNIT_MULT[m[2]];
  if (!Number.isFinite(target) || target <= 0) return true; // 읽을 수 없는 표기는 판정하지 않는다
  for (const pm of normalizedPage.matchAll(PAGE_NUMBER)) {
    const v = Number(pm[1]) * (pm[2] ? PAGE_MULT[pm[2]] : 1);
    if (Math.abs(v - target) <= target * UNIT_TOLERANCE) return true;
  }
  return false;
}

/** 이 페이지가 문장의 표지를 뒷받침하는가: 숫자는 전부, 이름은 절반 이상(번역·표기 차이 여유). */
export function pageSupports(tokens: CheckTokens, pageText: string): boolean {
  const t = norm(pageText);
  if (!tokens.numbers.every((n) => (UNIT_TOKEN.test(n) || MEASURE_TOKEN.test(n) ? unitSupported(n, t) : t.includes(n.toLowerCase())))) return false;
  if (tokens.names.length === 0) return true;
  const hit = tokens.names.filter((n) => t.includes(n.toLowerCase())).length;
  return hit >= Math.ceil(tokens.names.length / 2);
}

export type ClaimStatus = "supported" | "repointed" | "unsupported" | "unverified" | "unchecked";

export interface ClaimFinding {
  status: ClaimStatus;
  /** 각주 표기를 뺀 문장 */
  text: string;
  cited: number[];
  /** repointed일 때 새로 가리키게 된 번호 */
  to?: number[];
  tokens: CheckTokens;
}

/**
 * 본문의 각주 묶음([1][2])마다, 직전 각주 묶음 이후부터 그 묶음까지의 글을 "이 각주가 뒷받침해야 하는 문장"으로 보고 검사한다.
 *  - 인용한 페이지 중 하나라도 표지를 뒷받침 → supported
 *  - 인용한 페이지는 읽혔는데 어디에도 없고 다른 출처 페이지가 뒷받침 → 각주를 그 출처로 고친다(repointed)
 *  - 읽을 수 있는 어떤 페이지도 뒷받침하지 않음 → 각주를 지우고 unsupported로 알린다
 *  - 인용한 페이지를 읽지 못함(차단·동적 페이지) → 각주는 두고 unverified로 알린다
 * `rank`는 출처 신뢰도(큰 값이 우선) — 고쳐 가리킬 출처가 여럿일 때 고르는 기준.
 */
export function checkClaims(
  content: string,
  pages: PageTexts,
  rank: (n: number) => number = () => 0,
  opts: { markUnsupported?: boolean; units?: boolean; partial?: Set<number> } = {}
): { content: string; findings: ClaimFinding[] } {
  const findings: ClaimFinding[] = [];
  const groups = [...content.matchAll(/(?:\[\d+\])+/g)];
  if (groups.length === 0) return { content, findings };

  let out = "";
  let cursor = 0;
  let segStart = 0;
  for (const g of groups) {
    const gStart = g.index!;
    const gEnd = gStart + g[0].length;
    // 문장 경계: 직전 각주 묶음 끝, 또는 줄 시작 중 더 뒤
    const lineStart = content.lastIndexOf("\n", gStart - 1) + 1;
    const from = Math.max(segStart, lineStart);
    const rawSegment = content.slice(from, gStart);
    const text = rawSegment.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").replace(/\[\d+\]/g, "").trim();
    segStart = gEnd;
    const cited = [...g[0].matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
    const tokens = extractCheckTokens(text, { units: opts.units });
    out += content.slice(cursor, gStart);
    cursor = gEnd;
    const keep = g[0];
    // 영문 이름만 있는 문장은 각주를 건드리지 않는다 — 약어·고유명이 우연히 다른 페이지에 있는 것만으로 출처를 옮기면 오히려 틀릴 수 있다. 숫자(연도·수치)가 있을 때만 대조한다.
    if (tokens.numbers.length === 0) {
      out += keep;
      findings.push({ status: "unchecked", text, cited, tokens });
      continue;
    }
    const readable = cited.filter((n) => typeof pages.get(n) === "string" && (pages.get(n) as string).length > 200);
    if (readable.length === 0) {
      out += keep;
      findings.push({ status: "unverified", text, cited, tokens });
      continue;
    }
    if (readable.some((n) => pageSupports(tokens, pages.get(n) as string))) {
      out += keep;
      findings.push({ status: "supported", text, cited, tokens });
      continue;
    }
    // 인용한 페이지가 뒷받침하지 않는다 — 다른 출처가 뒷받침하는지 본다.
    const others = [...pages.entries()]
      .filter(([n, t]) => !cited.includes(n) && typeof t === "string" && t.length > 200 && pageSupports(tokens, t))
      .map(([n]) => n)
      .sort((a, b) => rank(b) - rank(a) || a - b);
    if (others.length > 0) {
      const to = others.slice(0, 2);
      out += to.map((n) => `[${n}]`).join("");
      findings.push({ status: "repointed", text, cited, to, tokens });
      continue;
    }
    // 읽은 페이지가 전부 "앞부분만 읽은 PDF"이면 못 읽은 쪽에 값이 있을 수 있다 — 지우지 않고 확인 불가로 둔다.
    if (opts.partial && readable.every((n) => opts.partial!.has(n))) {
      out += keep;
      findings.push({ status: "unverified", text, cited, tokens });
      continue;
    }
    // 읽은 페이지 중 뒷받침하는 곳이 없다 — 각주를 지운다(없는 근거를 있는 것처럼 보이지 않게). 읽지 못한 인용이 섞여 있으면 그 번호만 남긴다.
    // 문장은 지우지 않는다 — 대신 확인이 필요한 사실 주장임을 그 자리에 표시한다(의견·계획 문장은 제외).
    const unreadable = cited.filter((n) => !readable.includes(n));
    out += unreadable.map((n) => `[${n}]`).join("") + (opts.markUnsupported && !isOpinionOrPlan(text) ? UNVERIFIED_MARK : "");
    findings.push({ status: "unsupported", text, cited, tokens });
  }
  out += content.slice(cursor);
  return { content: out.replace(/ +([.,!?」』])/g, "$1"), findings };
}

export function describeToken(t: CheckTokens): string {
  return [...t.numbers, ...t.names].join(", ");
}
