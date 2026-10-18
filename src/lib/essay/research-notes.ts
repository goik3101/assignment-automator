// "조사 → 글쓰기" 2단계 생성의 순수 함수들. 검색은 사실 노트(사실 문장 + 근거 페이지)만 만들고, 글쓰기는 검색 없이 그 노트로만 쓴다.
// 문장 속 출처 번호는 모델이 우연히 붙이는 인용이 아니라 사실 번호([F3])를 코드가 URL로 바꾼 것이라 연결이 빠질 수 없다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

export interface Fact {
  id: string;
  fact: string;
  url: string;
  title: string;
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

/** 모델 응답에서 JSON 배열을 꺼낸다(앞뒤 설명·코드펜스가 섞여도). 못 읽으면 빈 배열. */
export function parseFactJson(text: string): { fact: string; url: string; title: string }[] {
  const a = text.indexOf("[");
  const b = text.lastIndexOf("]");
  if (a < 0 || b <= a) return [];
  try {
    const arr = JSON.parse(text.slice(a, b + 1)) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => x as { fact?: unknown; url?: unknown; title?: unknown })
      .filter((x) => typeof x.fact === "string" && x.fact.trim().length >= 6 && typeof x.url === "string" && /^https?:\/\//i.test(x.url))
      .map((x) => ({ fact: (x.fact as string).trim(), url: (x.url as string).trim(), title: typeof x.title === "string" ? x.title.trim() : "" }));
  } catch {
    return [];
  }
}

/**
 * 검색이 실제로 열어 본 페이지(consulted)에 없는 URL의 사실은 버린다 — 모델이 지어낸 주소로 출처를 달지 않기 위해서다.
 * consulted가 비어 있으면(제공자가 목록을 안 줌) 검증할 수 없으므로 null(= 이 경로를 쓰지 말 것).
 */
export function buildFacts(raw: { fact: string; url: string; title: string }[], consulted: string[] | undefined, max = 14): Fact[] | null {
  if (!consulted || consulted.length === 0) return null;
  const ok = new Set(consulted.map(normalizeUrl));
  const seen = new Set<string>();
  const out: Fact[] = [];
  for (const r of raw) {
    if (!ok.has(normalizeUrl(r.url))) continue;
    const key = r.fact.replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `F${out.length + 1}`, fact: r.fact, url: r.url, title: r.title });
    if (out.length >= max) break;
  }
  return out;
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
  const NUM = /(?<![\d.,])(1[0-9]{3}|20[0-9]{2})(?![\d])|\d+(?:\.\d+)?\s?%/g;
  const numsOf = (t: string) => new Set([...t.matchAll(NUM)].map((m) => m[0].replace(/\s/g, "")));
  const factNums = facts.map((f) => numsOf(f.fact));
  let attached = 0;
  const lines = text.split("\n").map((line) => {
    if (/^\s*(?:#|\|)/.test(line)) return line;
    // 문장 단위(마침표 뒤)로 나눠 각 문장 끝에만 붙인다
    return line.replace(/([^.!?。\n]+[.!?。])(?!\s*\[)/g, (sent: string) => {
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
