// 출처 수 정리. 검색 결과가 많다고 출처를 전부 달면 학생이 확인할 수 없고 같은 사실에 출처가 겹쳐 보인다 — 근거를 지키면서 필요한 만큼만 남긴다.
// 출처를 무조건 N개로 자르지 않는다: 고른 출처가 문장을 뒷받침하지 못하면(페이지 대조) 그 문장은 원래 출처를 그대로 살린다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.
import { extractCheckTokens, pageSupports, type PageTexts } from "./claim-check.ts";

export interface SourceLike {
  n: number;
  tier?: "official" | "reliable" | "reference" | "general" | "weak";
}

const TIER_SCORE: Record<string, number> = { official: 4, reliable: 3, general: 2, reference: 1.5, weak: 0 };
export const tierScore = (t?: string) => TIER_SCORE[t ?? "general"] ?? 2;

/** 안내문이 출처·참고문헌 개수를 요구하면 그 수(예: "참고 문헌 5개 이상")를 돌려준다. 없으면 null. */
export function requiredSourceCount(texts: string[]): number | null {
  const t = texts.join(" ");
  const m = t.match(/(?:출처|참고\s*문헌|참고\s*자료|자료)\s*(?:를|을)?\s*(\d{1,2})\s*(?:개|건|편)\s*(?:이상|이내|정도)?/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 20 ? n : null;
}

export interface SourceSelection {
  /** 남긴 출처의 이전 번호(새 번호 = 배열 순서 + 1) */
  keep: number[];
  /** 문장의 각주를 고른 출처 쪽으로 옮긴 수 */
  repointed: number;
  /** 고른 출처로 대체할 수 없어 원래 출처를 그대로 살린 문장 수 */
  retained: number;
}

interface Group {
  start: number;
  end: number;
  ns: number[];
  text: string;
}

function groupsOf(content: string): Group[] {
  const out: Group[] = [];
  let segStart = 0;
  for (const g of content.matchAll(/(?:\[\d+\])+/g)) {
    const gs = g.index!;
    const lineStart = content.lastIndexOf("\n", gs - 1) + 1;
    const from = Math.max(segStart, lineStart);
    out.push({
      start: gs,
      end: gs + g[0].length,
      ns: [...g[0].matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])),
      text: content.slice(from, gs).replace(/\[\d+\]/g, "").trim(),
    });
    segStart = gs + g[0].length;
  }
  return out;
}

/** 쓰인 횟수와 출처 신뢰도로 상위 limit개를 고른다. */
function topSources(all: SourceLike[], usage: Map<number, number>, limit: number): number[] {
  return [...all]
    .filter((s) => (usage.get(s.n) ?? 0) > 0)
    .sort((a, b) => (usage.get(b.n)! + tierScore(b.tier) * 0.8) - (usage.get(a.n)! + tierScore(a.tier) * 0.8) || a.n - b.n)
    .slice(0, limit)
    .map((s) => s.n);
}

/**
 * 모든 단계 본문을 한꺼번에 보고, 출처를 limit개 안팎으로 줄인다.
 *  - 고른 출처에 없는 번호만 달린 문장은, 고른 출처 중 그 문장의 연도·수치를 뒷받침하는 페이지가 있으면 그쪽으로 옮긴다.
 *  - 없으면 원래 출처를 살린다(그 출처가 목록에 추가됨). 이렇게 살려야 하는 문장이 25%를 넘으면 limit을 하나 늘려 다시 고른다(최대 limit+2).
 * 반환하는 contents는 새 번호(1부터)가 적용된 본문이다.
 */
export function limitSources<S extends SourceLike>(
  contents: string[],
  sources: S[],
  limit: number,
  pages: PageTexts = new Map(),
  /** 모델이 "고른 출처가 이 문장도 뒷받침한다"고 확인한 문장(키 "단계:순서") → 그 출처 번호 */
  forced: Map<string, number> = new Map()
): { contents: string[]; sources: S[]; mapping: Map<number, number>; stats: SourceSelection } {
  const usage = new Map<number, number>();
  const allGroups = contents.map(groupsOf);
  for (const gs of allGroups) for (const g of gs) for (const n of new Set(g.ns)) usage.set(n, (usage.get(n) ?? 0) + 1);
  const used = sources.filter((s) => (usage.get(s.n) ?? 0) > 0);
  if (used.length <= limit) {
    // 이미 충분히 적다 — 쓰이지 않은 출처만 빼고 번호를 이어 붙인다.
    return renumber(contents, used, allGroups, new Map(), { keep: used.map((s) => s.n), repointed: 0, retained: 0 });
  }
  const total = [...allGroups.flat()].length || 1;
  let chosen: number[] = [];
  let plan = new Map<string, number[]>();
  let repointed = 0;
  let retained = 0;
  for (let lim = limit; lim <= Math.min(limit + 2, used.length); lim++) {
    chosen = topSources(used, usage, lim);
    plan = new Map();
    repointed = 0;
    retained = 0;
    const extra = new Set<number>();
    allGroups.forEach((gs, ci) =>
      gs.forEach((g, gi) => {
        const inChosen = g.ns.filter((n) => chosen.includes(n));
        if (inChosen.length > 0) {
          plan.set(`${ci}:${gi}`, inChosen.slice(0, 2));
          return;
        }
        const key = `${ci}:${gi}`;
        const f = forced.get(key);
        if (f !== undefined && chosen.includes(f)) {
          plan.set(key, [f]);
          repointed++;
          return;
        }
        const tokens = extractCheckTokens(g.text);
        const alt = tokens.numbers.length
          ? chosen.find((n) => {
              const t = pages.get(n);
              return typeof t === "string" && t.length > 200 && pageSupports(tokens, t);
            })
          : undefined;
        if (alt !== undefined) {
          plan.set(`${ci}:${gi}`, [alt]);
          repointed++;
        } else {
          const best = [...g.ns].sort((a, b) => tierScore(sources.find((s) => s.n === b)?.tier) - tierScore(sources.find((s) => s.n === a)?.tier))[0];
          plan.set(`${ci}:${gi}`, [best]);
          extra.add(best);
          retained++;
        }
      })
    );
    if (retained / total <= 0.25) {
      chosen = [...chosen, ...extra];
      break;
    }
    if (lim === Math.min(limit + 2, used.length)) chosen = [...chosen, ...extra];
  }
  const keepSet = new Set(chosen);
  const kept = used.filter((s) => keepSet.has(s.n));
  return renumber(contents, kept, allGroups, plan, { keep: kept.map((s) => s.n), repointed, retained });
}

/**
 * limit개로 줄였을 때 코드(연도·수치 대조)만으로는 옮길 수 없어 원래 출처를 살려야 하는 문장들. 이 문장들을 모델에게 한 번에 물어
 * "고른 출처 중 어느 것이 이 문장도 뒷받침하는가"를 확인하면 출처를 더 줄일 수 있다(확인 안 되면 원래 출처 유지).
 */
export function retainedAtLimit<S extends SourceLike>(
  contents: string[],
  sources: S[],
  limit: number,
  pages: PageTexts = new Map()
): { chosen: number[]; items: { key: string; text: string }[] } {
  const usage = new Map<number, number>();
  const allGroups = contents.map(groupsOf);
  for (const gs of allGroups) for (const g of gs) for (const n of new Set(g.ns)) usage.set(n, (usage.get(n) ?? 0) + 1);
  const used = sources.filter((s) => (usage.get(s.n) ?? 0) > 0);
  if (used.length <= limit) return { chosen: used.map((s) => s.n), items: [] };
  const chosen = topSources(used, usage, limit);
  const items: { key: string; text: string }[] = [];
  allGroups.forEach((gs, ci) =>
    gs.forEach((g, gi) => {
      if (g.ns.some((n) => chosen.includes(n))) return;
      const tokens = extractCheckTokens(g.text);
      const alt = tokens.numbers.length
        ? chosen.find((n) => {
            const t = pages.get(n);
            return typeof t === "string" && t.length > 200 && pageSupports(tokens, t);
          })
        : undefined;
      if (alt === undefined && g.text.length >= 12) items.push({ key: `${ci}:${gi}`, text: g.text });
    })
  );
  return { chosen, items };
}

function renumber<S extends SourceLike>(
  contents: string[],
  kept: S[],
  allGroups: Group[][],
  plan: Map<string, number[]>,
  stats: SourceSelection
) {
  // 본문에 처음 나오는 순서로 새 번호를 매긴다.
  const order: number[] = [];
  const seen = new Set<number>();
  const keptSet = new Set(kept.map((s) => s.n));
  const resolved = allGroups.map((gs, ci) =>
    gs.map((g, gi) => {
      const ns = (plan.get(`${ci}:${gi}`) ?? g.ns).filter((n) => keptSet.has(n));
      for (const n of ns) {
        if (seen.has(n)) continue;
        seen.add(n);
        order.push(n);
      }
      return ns;
    })
  );
  const mapping = new Map(order.map((n, i) => [n, i + 1]));
  const out = contents.map((content, ci) => {
    let res = "";
    let cursor = 0;
    allGroups[ci].forEach((g, gi) => {
      res += content.slice(cursor, g.start);
      res += [...new Set(resolved[ci][gi])].map((n) => `[${mapping.get(n)}]`).join("");
      cursor = g.end;
    });
    return (res + content.slice(cursor)).replace(/ +([.,!?」』])/g, "$1");
  });
  const newSources = order.map((n) => ({ ...kept.find((s) => s.n === n)!, n: mapping.get(n)! }));
  return { contents: out, sources: newSources, mapping, stats };
}
