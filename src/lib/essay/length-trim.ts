// 분량 초과 단계를 "문장 단위 삭제"로 줄인다 — 모델에게 "N단어로 다시 써 줘"라고 시키면 목표보다 10~20%만 줄이는 일이 반복돼(실측 2026-10-26:
// 263단어를 162로 요청 → 205·224·234) 범위(190)에 못 들어갔다. 모델은 단어 수를 못 세므로, 지울 문장의 "순서"만 모델이 정하고
// 실제로 몇 개를 지울지는 코드가 세면서 결정한다. alias import 없음 — node:test에서 바로 불러올 수 있게.

export interface TrimUnit {
  id: number;
  line: number;
  text: string;
  /** 지울 수 없는 문장(소제목 아래 하나뿐인 문장·줄의 첫 문장·채점 대상·인용·유일한 각주). */
  locked: boolean;
}

interface LineInfo {
  raw: string;
  prefix: string;
  unitIds: number[];
}

export interface TrimModel {
  lines: LineInfo[];
  units: TrimUnit[];
}

const SKIP_LINE = /^\s*(?:$|#{1,6}\s|\||(?:[-*_]\s*){3,}$|>|```)/;
// 문장 끝(마침표·물음표·느낌표) 뒤에 각주·닫는 따옴표가 붙어 있어도 그 뒤 공백에서 자른다.
const SENTENCE_BREAK = /(?<=[.!?。…](?:\[\d+\])*["”’')」』]*)\s+/;
const BULLET = /^(\s*(?:[-*•]|\d+[.)])\s+)/;
const MARKER = /\[\d+\]/g;
const HAS_MARKER = /\[\d+\]/;
const QUOTED = /[「『“"]([^」』”"\n]{4,})[」』”"]/;

/** 글을 줄·문장으로 나눈다. lockFn(문장, 전체 문장 목록)이 true면 그 문장은 지우지 않는다. */
export function buildTrimModel(content: string, lockFn?: (sentence: string, all: string[]) => boolean): TrimModel {
  const lines: LineInfo[] = [];
  const units: TrimUnit[] = [];
  for (const [li, raw] of content.split("\n").entries()) {
    if (SKIP_LINE.test(raw)) {
      lines.push({ raw, prefix: "", unitIds: [] });
      continue;
    }
    const prefix = BULLET.exec(raw)?.[1] ?? "";
    const body = raw.slice(prefix.length).trim();
    const sentences = body.split(SENTENCE_BREAK).filter((s) => s.trim());
    const ids: number[] = [];
    sentences.forEach((s, i) => {
      // 줄에 문장이 하나뿐이거나 첫 문장이면 잠근다(줄·항목 자체가 사라지거나 문단의 주제문이 날아가지 않게).
      units.push({ id: units.length, line: li, text: s, locked: sentences.length === 1 || i === 0 });
      ids.push(units.length - 1);
    });
    lines.push({ raw, prefix, unitIds: ids });
  }
  const all = units.map((u) => u.text);
  const markerCount = new Map<string, number>();
  for (const t of all) for (const m of new Set(t.match(MARKER) ?? [])) markerCount.set(m, (markerCount.get(m) ?? 0) + 1);
  for (const u of units) {
    if (u.locked) continue;
    if (u.text.includes("**") || QUOTED.test(u.text)) u.locked = true;
    // 본문에서 한 문장에만 쓰인 각주는 지우면 출처가 통째로 사라진다.
    else if ((u.text.match(MARKER) ?? []).some((m) => markerCount.get(m) === 1)) u.locked = true;
    else if (lockFn?.(u.text, all)) u.locked = true;
  }
  return { lines, units };
}

/** 지운 문장을 뺀 글을 다시 만든다. 줄 구조·소제목·빈 줄은 그대로. */
export function renderTrimmed(model: TrimModel, removed: ReadonlySet<number>): string {
  return model.lines
    .map((l) => {
      if (l.unitIds.length === 0) return l.raw;
      const kept = l.unitIds.filter((id) => !removed.has(id)).map((id) => model.units[id].text);
      return kept.length === l.unitIds.length ? l.raw : l.prefix + kept.join(" ");
    })
    .join("\n");
}

/** 줄이기를 멈추는 목표: 상한보다 약간 아래(세는 방식이 조금 달라도 상한을 넘지 않게). 상한이 없으면 줄일 필요가 없다. */
export function trimStopAt(min: number, max: number): number {
  return max > 0 ? (min > 0 ? Math.round(max - (max - min) * 0.25) : Math.round(max * 0.92)) : Infinity;
}

export interface TrimResult {
  text: string;
  removed: number[];
  count: number;
  /** 범위(상한 이하, 하한 이상)에 들어왔는가. */
  inRange: boolean;
}

/**
 * 모델이 정한 삭제 순서(order)대로 지우되, 하한 밑으로 내려가거나 accept를 어기는 삭제는 건너뛰고 목표(상한보다 약간 아래)에 닿으면 멈춘다.
 * 순서가 모자라면 남은 문장 중 긴 것부터(각주 없는 것 우선) 이어서 지워 범위에 닿게 한다.
 */
export function trimToRange(
  model: TrimModel,
  order: readonly number[],
  measure: (text: string) => number,
  range: { min: number; max: number },
  /** 후보 글이 지켜야 할 조건(각주·인용·채점 대상 어법이 남아 있는가 등). false면 그 삭제는 건너뛴다. */
  accept: (text: string) => boolean = () => true
): TrimResult {
  const { min, max } = range;
  const stopAt = trimStopAt(min, max);
  const removed = new Set<number>();
  let text = renderTrimmed(model, removed);
  let count = measure(text);
  const tryRemove = (id: number) => {
    const u = model.units[id];
    if (!u || u.locked || removed.has(id)) return;
    removed.add(id);
    const nextText = renderTrimmed(model, removed);
    const nextCount = measure(nextText);
    if ((min > 0 && nextCount < min) || !accept(nextText)) removed.delete(id);
    else {
      text = nextText;
      count = nextCount;
    }
  };
  for (const id of order) {
    if (count <= stopAt) break;
    tryRemove(id);
  }
  if (count > stopAt) {
    const rest = model.units
      .filter((u) => !u.locked && !removed.has(u.id))
      .sort((a, b) => Number(HAS_MARKER.test(a.text)) - Number(HAS_MARKER.test(b.text)) || b.text.length - a.text.length);
    for (const u of rest) {
      if (count <= stopAt) break;
      tryRemove(u.id);
    }
  }
  return { text, removed: [...removed], count, inRange: (max <= 0 || count <= max) && (min <= 0 || count >= min) };
}

/** 모델에게 보여 줄 번호 붙은 문장 목록. 잠긴 문장은 번호 없이 "유지"로 표시한다. */
export function describeUnitsForModel(model: TrimModel, size: (s: string) => number): string {
  return model.lines
    .map((l) => {
      if (l.unitIds.length === 0) return l.raw;
      return l.unitIds.map((id) => {
        const u = model.units[id];
        return u.locked ? `(유지) ${u.text}` : `[${u.id}] (${size(u.text)}) ${u.text}`;
      }).join("\n");
    })
    .join("\n");
}

export interface BodyLine {
  /** content.split("\n")에서의 줄 번호. */
  index: number;
  /** 줄 앞의 글머리표("- ", "1. ")는 그대로 두고 본문만 다룬다. */
  prefix: string;
  text: string;
}

/** 소제목·표·빈 줄을 뺀 본문 줄. 한 줄에 문장이 하나뿐이라 문장 삭제로는 못 줄이는 글을 줄 단위로 다시 쓸 때 쓴다. */
export function bodyLines(content: string): BodyLine[] {
  const out: BodyLine[] = [];
  for (const [index, raw] of content.split("\n").entries()) {
    if (SKIP_LINE.test(raw)) continue;
    const prefix = BULLET.exec(raw)?.[1] ?? "";
    const text = raw.slice(prefix.length).trim();
    if (text) out.push({ index, prefix, text });
  }
  return out;
}

export function replaceLines(content: string, edits: ReadonlyMap<number, string>): string {
  return content
    .split("\n")
    .map((raw, i) => {
      const next = edits.get(i);
      if (next === undefined) return raw;
      return (BULLET.exec(raw)?.[1] ?? "") + next;
    })
    .join("\n");
}

/**
 * 줄마다 쓸 수 있는 최대 크기. 본문 합계가 목표(stopAt - 소제목 등 본문 아닌 부분)에 닿도록 각 줄을 같은 비율로 줄인다.
 * 이미 예산 안인 줄은 목록에서 빼서 다시 쓰지 않는다. 줄이 너무 작아지지 않게 하한(minEach)을 둔다.
 */
export function lineBudgets(
  lines: readonly { index: number; size: number }[],
  nonBodySize: number,
  stopAt: number,
  minEach = 4
): Map<number, number> {
  const bodyTotal = lines.reduce((n, l) => n + l.size, 0);
  const target = Math.max(1, stopAt - nonBodySize);
  const ratio = bodyTotal > 0 ? Math.min(1, target / bodyTotal) : 1;
  const out = new Map<number, number>();
  for (const l of lines) {
    const budget = Math.max(minEach, Math.floor(l.size * ratio));
    if (l.size >= minEach * 2 && l.size > budget) out.set(l.index, budget);
  }
  return out;
}
