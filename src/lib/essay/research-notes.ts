// "조사 → 글쓰기" 2단계 생성의 순수 함수들. 검색은 사실 노트(사실 문장 + 근거 페이지)만 만들고, 글쓰기는 검색 없이 그 노트로만 쓴다.
// 문장 속 출처 번호는 모델이 우연히 붙이는 인용이 아니라 사실 번호([F3])를 코드가 URL로 바꾼 것이라 연결이 빠질 수 없다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

export interface Fact {
  id: string;
  fact: string;
  url: string;
  title: string;
  /** 서지 사실일 때, 그 페이지에 적힌 책 제목·저자 표기 그대로(페이지 본문에 실제로 있는지 코드가 대조한다). */
  printedTitle?: string;
  printedAuthor?: string;
}

export interface RawFact {
  fact: string;
  url: string;
  title: string;
  printedTitle?: string;
  printedAuthor?: string;
}

/** 주소를 비교용으로 정규화한다(추적 쿼리·#조각·www·끝 슬래시 제거, 소문자 호스트). */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    for (const k of [...u.searchParams.keys()]) if (/^(utm_.*|fbclid|gclid|platform|source)$/i.test(k)) u.searchParams.delete(k);
    u.hash = "";
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    const q = u.searchParams.toString();
    return `${host}${path}${q ? "?" + q : ""}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

/**
 * 기관·포털의 첫 화면 주소인가(me.go.kr/, air.go.kr/main.do 같은). 실측(2026-10-30, 실제 제출 결과물):
 * 미세먼지 과제의 출처 2개가 둘 다 기관 메인 페이지여서 연도별 수치를 하나도 뒷받침하지 못했고, 링크 확인도 "자동 확인 불가"였다.
 * 첫 화면은 내용이 계속 바뀌므로 어떤 구체적 사실의 근거도 될 수 없다.
 */
const LANDING_PATH = /^\/?(?:index|main|home|default)?(?:\.(?:do|jsp|html?|php|aspx?))?$/i;
export function isLandingPage(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.search || u.hash) return false;
    return LANDING_PATH.test(u.pathname.replace(/\/+$/, ""));
  } catch {
    return false;
  }
}

function cleanFacts(arr: unknown[]): RawFact[] {
  return arr
    .map((x) => x as { fact?: unknown; url?: unknown; title?: unknown; printed_title?: unknown; printed_author?: unknown })
    .filter((x) => typeof x.fact === "string" && x.fact.trim().length >= 6 && typeof x.url === "string" && /^https?:\/\//i.test(x.url))
    .map((x) => ({
      // 검색 응답 원문을 읽으면 사실 문장 안에 모델이 붙인 "([사이트](주소))"가 남아 있을 수 있다 — 주소는 url 필드가 따로 갖는다.
      fact: (x.fact as string).replace(/\s*\(?\[[^\]\n]{1,120}\]\(https?:\/\/[^)\s]+\)\)?/g, "").trim(),
      url: (x.url as string).trim(),
      title: typeof x.title === "string" ? x.title.trim() : "",
      printedTitle: typeof x.printed_title === "string" && x.printed_title.trim() ? x.printed_title.trim() : undefined,
      printedAuthor: typeof x.printed_author === "string" && x.printed_author.trim() ? x.printed_author.trim() : undefined,
    }))
    .filter((x) => x.fact.length >= 6);
}

/**
 * 출처별로 묶은 형식 [{url,title,printed_title?,printed_author?,facts:["문장",...]}]을 사실 단위로 펼친다.
 * 주소·제목을 사실마다 반복해 쓰면 출력 토큰이 늘어서(출력 단가가 입력의 8배) 출처당 한 번만 쓰게 했다.
 */
function flattenGrouped(arr: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const g of arr) {
    const s = g as { url?: unknown; title?: unknown; printed_title?: unknown; printed_author?: unknown; facts?: unknown };
    if (!Array.isArray(s?.facts)) {
      out.push(g); // 사실 단위 항목(예전 형식)은 그대로
      continue;
    }
    for (const f of s.facts) {
      const text = typeof f === "string" ? f : (f as { fact?: unknown })?.fact;
      out.push({ fact: text, url: s.url, title: s.title, printed_title: s.printed_title, printed_author: s.printed_author });
    }
  }
  return out;
}

/** 모델 응답에서 JSON 배열을 꺼낸다(앞뒤 설명·코드펜스가 섞여도). 사실 단위·출처별 묶음 형식 모두 읽는다. 못 읽으면 빈 배열. */
export function parseFactJson(text: string): RawFact[] {
  const a = text.indexOf("[");
  const b = text.lastIndexOf("]");
  if (a < 0 || b <= a) return parseFactJsonLoose(text);
  try {
    const arr = JSON.parse(text.slice(a, b + 1)) as unknown;
    return Array.isArray(arr) ? cleanFacts(flattenGrouped(arr)) : [];
  } catch {
    return parseFactJsonLoose(text);
  }
}

const STR = /"((?:[^"\\\n]|\\.)*)"/;
function readStr(block: string, key: string): string | undefined {
  const m = new RegExp(`"${key}"\\s*:\\s*${STR.source}`).exec(block);
  if (!m) return undefined;
  try {
    return JSON.parse(`"${m[1]}"`) as string;
  } catch {
    return m[1];
  }
}

/**
 * JSON.parse가 실패한 조사 응답(실측: 괄호 하나가 빠진 `"facts":["…"}]`로 사실 0개 → 기존 경로로 폴백, +30초·출처 0개)에서
 * 객체 단위로 url·title·사실 문장을 직접 읽는다. 출처별 묶음 객체는 문자열 배열만 품어 중첩 중괄호가 없으므로 `{…}` 단위로 자를 수 있다.
 * URL은 여기서 믿지 않는다 — 호출부의 buildFacts가 검색이 실제로 연 페이지 목록과 다시 대조한다.
 */
export function parseFactJsonLoose(text: string): RawFact[] {
  const out: unknown[] = [];
  for (const m of text.matchAll(/\{[^{}]*\}/g)) {
    const block = m[0];
    const url = readStr(block, "url");
    if (!url) continue;
    const base = { url, title: readStr(block, "title"), printed_title: readStr(block, "printed_title"), printed_author: readStr(block, "printed_author") };
    const single = readStr(block, "fact");
    if (single) {
      out.push({ ...base, fact: single });
      continue;
    }
    const at = /"facts"\s*:\s*\[/.exec(block);
    if (!at) continue;
    const rest = block.slice(at.index + at[0].length);
    for (const s of rest.matchAll(new RegExp(`${STR.source}(?!\\s*:)`, "g"))) {
      try {
        out.push({ ...base, fact: JSON.parse(`"${s[1]}"`) as string });
      } catch {
        out.push({ ...base, fact: s[1] });
      }
    }
  }
  return cleanFacts(out);
}

/** 책 과제 조사 응답: {"book":{title,author,exists},"facts":[...]} (설명·코드펜스가 섞여도). 못 읽으면 null. */
export function parseBookResearch(text: string): { book: { title: string; author: string; exists: boolean }; facts: RawFact[] } | null {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    const o = JSON.parse(text.slice(a, b + 1)) as { book?: { title?: unknown; author?: unknown; exists?: unknown }; facts?: unknown; sources?: unknown };
    const list = Array.isArray(o.sources) ? o.sources : o.facts;
    if (!o.book || !Array.isArray(list)) return null;
    const title = typeof o.book.title === "string" ? o.book.title.trim() : "";
    if (!title) return null;
    return { book: { title, author: typeof o.book.author === "string" ? o.book.author.trim() : "", exists: o.book.exists !== false }, facts: cleanFacts(flattenGrouped(list)) };
  } catch {
    // 괄호 하나가 어긋난 응답도 책 정보·사실을 객체 단위로 읽는다(parseFactJsonLoose와 같은 이유).
    const bookBlock = /"book"\s*:\s*(\{[^{}]*\})/.exec(text)?.[1];
    const title = bookBlock ? readStr(bookBlock, "title")?.trim() : undefined;
    if (!bookBlock || !title) return null;
    const facts = parseFactJsonLoose(text.replace(bookBlock, "{}"));
    if (facts.length === 0) return null;
    return { book: { title, author: readStr(bookBlock, "author")?.trim() ?? "", exists: !/"exists"\s*:\s*false/.test(bookBlock) }, facts };
  }
}

/**
 * 검색이 실제로 열어 본 페이지(consulted)에 없는 URL의 사실은 버린다 — 모델이 지어낸 주소로 출처를 달지 않기 위해서다.
 * consulted가 비어 있으면(제공자가 목록을 안 줌) 검증할 수 없으므로 null(= 이 경로를 쓰지 말 것).
 */
export function buildFacts(raw: RawFact[], consulted: string[] | undefined, max = 14, balanced = true): Fact[] | null {
  if (!consulted || consulted.length === 0) return null;
  const ok = new Set(consulted.map(normalizeUrl));
  const seen = new Set<string>();
  const eligible: RawFact[] = [];
  const landing: RawFact[] = [];
  for (const r of raw) {
    if (!ok.has(normalizeUrl(r.url))) continue;
    const key = r.fact.replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    // 기관 첫 화면 주소는 근거가 못 된다 — 다만 이것까지 버리면 사실이 너무 적어 폴백(느린 경로)으로 떨어지므로 뒤로 미뤄 둔다.
    (isLandingPage(r.url) ? landing : eligible).push(r);
  }
  if (eligible.length < 4 && landing.length > 0) eligible.push(...landing.slice(0, 4 - eligible.length));
  // 출처별로 묶어 쓴 응답은 앞쪽 출처의 사실이 몰려 있어, 앞에서부터 자르면 뒤 항목(예: 전개 과정)의 사실이 통째로 빠진다 — 넘칠 때는 출처를 돌아가며 고른다(순서는 원래대로).
  let picked = eligible.slice(0, max);
  if (balanced && eligible.length > max) {
    const byUrl = new Map<string, number[]>();
    eligible.forEach((r, i) => {
      const k = normalizeUrl(r.url);
      byUrl.set(k, [...(byUrl.get(k) ?? []), i]);
    });
    const queues = [...byUrl.values()];
    const chosen: number[] = [];
    for (let round = 0; chosen.length < max; round++) {
      let added = false;
      for (const q of queues) {
        if (round < q.length && chosen.length < max) {
          chosen.push(q[round]);
          added = true;
        }
      }
      if (!added) break;
    }
    picked = chosen.sort((a, b) => a - b).map((i) => eligible[i]);
  }
  return picked.map((r, i) => ({ id: `F${i + 1}`, fact: r.fact, url: r.url, title: r.title, printedTitle: r.printedTitle, printedAuthor: r.printedAuthor }));
}

/** 문자 2-gram 집합(보강 조사가 같은 사실을 다른 표현으로 다시 가져왔는지 보는 데 쓴다). */
function bigrams(text: string): Set<string> {
  const t = text.replace(/[\s.,·'"“”’‘()\[\]]/g, "");
  const out = new Set<string>();
  for (let i = 0; i + 2 <= t.length; i++) out.add(t.slice(i, i + 2));
  return out;
}

function similarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * 보강 조사로 얻은 사실을 기존 노트에 덧붙인다. 같은 주소의 같은 문장이나 표현만 바꾼 중복은 버리고,
 * 전체 상한(max)을 넘지 않게 자른 뒤 번호(F1…)를 다시 매긴다 — 번호는 글쓰기 프롬프트에 그대로 쓰이므로 빈 번호가 있으면 안 된다.
 * 임계값 0.45는 실제 문장으로 재어 정했다: 어순만 바꾼 같은 사실 0.50, 같은 판결의 다른 측면 0.34, 서로 다른 사실 0.02~0.04.
 * 같은 사건의 다른 측면(0.34)은 남긴다 — 하나로 합칠지는 글쓰기가 판단할 일이고, 어차피 같은 페이지면 근거 수 계산에서 한 곳으로 센다.
 */
export function mergeFacts(base: Fact[], extra: Fact[], max = 14): Fact[] {
  const merged = [...base];
  for (const f of extra) {
    if (merged.length >= max) break;
    const dup = merged.some(
      (m) => (normalizeUrl(m.url) === normalizeUrl(f.url) && m.fact.replace(/\s+/g, "") === f.fact.replace(/\s+/g, "")) || similarity(m.fact, f.fact) >= 0.45
    );
    if (!dup) merged.push(f);
  }
  return merged.map((f, i) => ({ ...f, id: `F${i + 1}` }));
}

export function factSheetText(facts: Fact[]): string {
  return facts.map((f) => `[${f.id}] ${f.fact}`).join("\n");
}

/**
 * 글 속 [F3] 표기를 출처 번호 [n]으로 바꾼다. 번호는 본문에 처음 나오는 순서로 매기고, 같은 URL은 한 출처로 합친다.
 * 노트에 없는 번호는 지운다. 반환 sources는 실제로 쓰인 것만.
 */
export function mapFactMarkers(text: string, facts: Fact[]): { text: string; sources: { n: number; title: string; url: string }[]; unknown: number } {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const urlToN = new Map<string, number>();
  const sources: { n: number; title: string; url: string }[] = [];
  let unknown = 0;
  const out = text.replace(/(?:\[F\d+\])+/g, (group) => {
    const ns: number[] = [];
    for (const m of group.matchAll(/\[(F\d+)\]/g)) {
      const f = byId.get(m[1]);
      if (!f) {
        unknown++;
        continue;
      }
      const key = normalizeUrl(f.url);
      let n = urlToN.get(key);
      if (n === undefined) {
        n = sources.length + 1;
        urlToN.set(key, n);
        sources.push({ n, title: f.title || hostOf(f.url), url: f.url });
      }
      if (!ns.includes(n)) ns.push(n);
    }
    return ns.map((n) => `[${n}]`).join("");
  });
  // 번호를 지운 자리의 " ." 같은 잔여 공백 정리
  return { text: out.replace(/[ \t]+([.,!?」』])/g, "$1"), sources, unknown };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** 첫 "## 단계" 제목 앞에 있는 불릿 줄을 전체 요약(summary_lines)으로 뽑는다 — 예전에는 이것만을 위해 모델을 한 번 더 불렀다. */
export function extractSummaryLines(text: string): string[] {
  const head = text.split(/^##[ \t]/m)[0] ?? "";
  return head
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^(?:[-*•]|\d+[.)])\s+\S/.test(l))
    .map((l) => l.replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim())
    .slice(0, 5);
}

/**
 * 글쓰기 호출이 사실 번호를 거의 안 붙였을 때의 복구: 번호 없는 문장 중 연도·수치가 사실 노트의 어떤 사실과 같은 값을 공유하면 그 사실의 번호를 붙인다(모델 호출 없음).
 * 같은 값을 공유하는 사실이 둘 이상이면 문장과 겹치는 숫자가 가장 많은 쪽을 쓴다. 값이 없는 서술 문장은 건드리지 않는다.
 */
export function attachFactMarkers(text: string, facts: Fact[]): { text: string; attached: number } {
  // 연도·퍼센트만 보면 "59,459톤", "26㎍/m³" 같은 값이 든 문장을 놓친다(실측 2026-10-30: 복구 후에도 남은 무각주 수치 문장이 전부 이런 값이었다).
  const NUM =
    /(?<![\d.,])(1[0-9]{3}|20[0-9]{2})(?![\d])|\d+(?:\.\d+)?\s?%|(?<![\d.])\d{1,3}(?:,\d{3})+(?![\d])|(?<![\d.])\d+(?:\.\d+)?\s?(?:㎍|㎎|[μu]g|mg|톤|억|조|만\s?명|명|건|배|위)/g;
  const numsOf = (t: string) => new Set([...t.matchAll(NUM)].map((m) => m[0].replace(/\s/g, "")));
  const factNums = facts.map((f) => numsOf(f.fact));
  let attached = 0;
  const lines = text.split("\n").map((line) => {
    if (/^\s*(?:#|\|)/.test(line)) return line;
    // 문장 단위(마침표 뒤)로 나눠 각 문장 끝에만 붙인다
    // 소수점을 문장 끝으로 보면 안 된다 — 실측(2026-10-31, 사용자 결과물): "재활용률은 85.[1]49%이다"처럼 숫자 한가운데에 각주가 박혔다.
    // 마침표를 품을 수 있게 게으른 매칭으로 바꾸고, 뒤에 숫자가 오는 마침표(소수점)는 문장 끝으로 보지 않는다.
    return line.replace(/([^\n]+?[.!?。])(?!\d)(?!\s*\[)/g, (sent: string) => {
      if (/\[(?:F\d+|\d+)\]/.test(sent)) return sent;
      const nums = numsOf(sent);
      if (nums.size === 0) return sent;
      let best = -1;
      let bestScore = 0;
      factNums.forEach((fn, i) => {
        let score = 0;
        for (const n of nums) if (fn.has(n)) score++;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });
      if (best < 0) return sent;
      attached++;
      return `${sent}[${facts[best].id}]`;
    });
  });
  return { text: lines.join("\n"), attached };
}

const squash = (t: string) => t.toLowerCase().replace(/[\s"'“”‘’『』《》「」.,·\-–—:;()]/g, "");

/**
 * 책 서지 확인: 서지 사실이 적은 "페이지에 인쇄된 제목·저자 표기"가 그 페이지 본문에 둘 다 실제로 있으면 확인된 것으로 본다(모델 호출 없음).
 * pageText는 호출부가 받아 둔 본문(못 받았으면 null). 확인 못 하면 false — 호출부가 기존 검색 기반 저자 확인으로 돌아간다.
 */
export function confirmBookFromPages(facts: Fact[], pageText: (url: string) => string | null, altTitles: string[] = []): boolean {
  for (const f of facts) {
    if (!f.printedTitle || !f.printedAuthor) continue;
    const page = pageText(f.url);
    if (!page) continue;
    const p = squash(page);
    // 인쇄된 제목은 "원제 / 부제 / 저자"처럼 길게 오는 일이 있어 첫 토막이나 조사가 확인한 제목이 페이지에 있어도 인정한다.
    const titles = [f.printedTitle, f.printedTitle.split(/[/;|]/)[0], ...altTitles].map(squash).filter((t) => t.length >= 2);
    if (squash(f.printedAuthor).length >= 2 && p.includes(squash(f.printedAuthor)) && titles.some((t) => p.includes(t))) return true;
  }
  return false;
}

/** 같은 과제에서 먼저 쓴 완성 원고의 "[n] 각주가 붙은 문장"을 사실 노트로 바꾼다 — 실행 계획(신문 머리기사·만평 등)이
 * 그 사실을 다시 검색하지 않고 쓰게(실측: 원고 뒤 계획의 조사 호출 11~13초). 확인 실패한 출처의 문장은 쓰지 않는다. */
export function factsFromCitedText(text: string, sources: { n: number; title: string; url: string; url_valid?: boolean | null }[], max = 14): Fact[] {
  const byN = new Map(sources.filter((s) => s.url_valid !== false && /^https?:\/\//i.test(s.url)).map((s) => [s.n, s]));
  const seen = new Set<string>();
  const out: Fact[] = [];
  for (const line of text.split("\n")) {
    if (/^\s*#/.test(line)) continue;
    for (const sentence of line.match(/[^.!?。]+[.!?。]?(?:\s*\[\d+\])+/g) ?? []) {
      const n = Number(/\[(\d+)\]/.exec(sentence)?.[1]);
      const src = byN.get(n);
      const fact = sentence.replace(/\s*\[\d+\]/g, "").replace(/^[\s\-*•]+/, "").replace(/\*\*/g, "").trim();
      if (!src || fact.length < 12 || seen.has(fact)) continue;
      seen.add(fact);
      out.push({ id: `F${out.length + 1}`, fact, url: src.url, title: src.title });
      if (out.length >= max) return out;
    }
  }
  return out;
}
