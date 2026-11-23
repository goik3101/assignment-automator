// 리듬 창작 과제(음악: "4분의 4박자, 24마디, 음표의 읽는 방법으로 표현")의 **검증 가능한 오류**를 코드가 잡는다. alias import 없음 — node:test에서 바로 불러옴.
//
// 왜(2026-11-23 실제 제출 1건, 이후 같은 안내문 재생성 6회):
//  ① 안내문의 읽기 표(큐-울(쿵) 2박, 사과 1박 …)가 사진 분석에서 구조(provided_materials)로 안 넘어오고 원문 전사(notice_text)에만 남았다 —
//     글쓰기 모델이 표를 못 보고 "타/티카"를 새로 지어 냈다. 전사 글만으로 재분석하면 표가 6/6 들어가므로 **사진 읽기가 아니라 구조 분류의 흔들림**이다.
//  ② 표를 줘도 마디의 박 합이 4가 아닌 줄이 8·2·25개(3회)였고, 같은 마디가 되풀이됐다. 모델은 산수를 자주 틀리지만 **틀린 곳을 짚어 주면 고친다** —
//     그래서 안내문 표에서 (읽기 낱말 → 박)만 뽑아 코드가 마디마다 합을 세고, 틀린 마디만 짚어 그 단계를 한 번 다시 쓰게 한다.
// 표의 다른 줄(배점표 같은 행정 표)은 읽지 않는다: "N박" 칸 바로 옆 낱말 쌍만 뽑으므로 평가표가 프롬프트로 새지 않는다.

export interface BeatEntry {
  word: string;
  beats: number;
}

const BLANK = /^[_?？\s.·…\-―—]*$/;

/** 표 줄("___|2박|큐-울(쿵)|___|1박|배")에서 "N박 칸 다음 칸의 낱말"을 (낱말, 박)으로 뽑는다. 같은 낱말은 한 번만. */
export function readBeatTable(texts: (string | undefined)[]): BeatEntry[] {
  const out: BeatEntry[] = [];
  for (const text of texts) {
    for (const line of (text ?? "").split("\n")) {
      if (!line.includes("|")) continue;
      const cells = line.split("|").map((c) => c.trim());
      for (let i = 0; i + 1 < cells.length; i++) {
        const m = /^(\d{1,2})\s*박$/.exec(cells[i]);
        const word = cells[i + 1];
        if (!m || !word || BLANK.test(word) || word.length > 14 || /\s{2,}|[:：]/.test(word)) continue;
        if (!out.some((e) => e.word === word)) out.push({ word, beats: Number(m[1]) });
      }
    }
  }
  return out;
}

/** "4분의 4박자"·"4/4박자" → 한 마디의 박 수. 4분음표가 한 박인 박자만 읽는다(8분의 6박자 등은 null). */
export function beatsPerMeasure(texts: (string | undefined)[]): number | null {
  for (const t of texts) {
    const m = /(\d)\s*분의\s*(\d)\s*박자/.exec(t ?? "") ?? /(\d)\s*\/\s*(\d)\s*박자/.exec(t ?? "");
    if (!m) continue;
    const [top, bottom] = /분의/.test(m[0]) ? [Number(m[2]), Number(m[1])] : [Number(m[1]), Number(m[2])];
    if (bottom === 4 && top >= 2 && top <= 6) return top;
  }
  return null;
}

export function rhythmOn(): boolean {
  return process.env.RHYTHM_CHECK !== "off";
}

const isRhythmTask = (texts: (string | undefined)[]) => texts.some((t) => /마디/.test(t ?? "")) && beatsPerMeasure(texts) !== null;

/**
 * 분석이 표를 자료로 못 넘겼을 때(원문 전사에만 있을 때) 글쓰기가 볼 한 줄을 만든다. 이미 자료에 있으면 null.
 * texts: 요구사항·단계 설명 등 안내문 요약 글. 리듬 창작 과제(마디+박자)가 아니면 null.
 */
export function recoverBeatTable(provided: string[] | undefined, noticeText: string | undefined, texts: (string | undefined)[]): string | null {
  if (!isRhythmTask(texts)) return null;
  const entries = readBeatTable([noticeText]);
  if (entries.length < 3) return null;
  const have = (provided ?? []).join("\n");
  if (entries.every((e) => have.includes(e.word))) return null;
  return beatTableLine(entries, beatsPerMeasure(texts) ?? 4);
}

export function beatTableLine(entries: BeatEntry[], per: number): string {
  const byBeats = new Map<number, string[]>();
  for (const e of entries) byBeats.set(e.beats, [...(byBeats.get(e.beats) ?? []), e.word]);
  const parts = [...byBeats].sort((a, b) => b[0] - a[0]).map(([b, ws]) => `${b}박: ${ws.join(", ")}`);
  return `음표 읽기 표(안내문): ${parts.join(" / ")}. 한 마디는 ${per}박이고, 마디마다 읽기 낱말의 박을 더해 정확히 ${per}박이 되게 짠다. 마디는 한 줄씩 "N마디 | 읽기 낱말들(띄어 씀) | 가사" 꼴로 쓰고 표의 낱말을 표에 적힌 그대로 쓴다.`;
}

interface Tok {
  at: number;
  end: number;
  e: BeatEntry;
  /** "(2박)"처럼 낱말 앞에 붙은 표기의 시작 위치 */
  annAt?: number;
}

const EXPLAIN = /박은|박으로|나머지|기본 규칙|구성 원칙|표기|\d박\s*:/;
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "큐-울(쿵)"을 모델이 "큐-울"로 줄여 쓰는 일이 잦다 — 괄호 앞 낱말도 같은 박으로 읽는다. */
function withAliases(entries: BeatEntry[]): BeatEntry[] {
  const out = [...entries];
  for (const e of entries) {
    const m = /^([^()]{2,})(.+)$/.exec(e.word);
    if (m && !out.some((o) => o.word === m[1])) out.push({ word: m[1], beats: e.beats });
  }
  return out;
}

/** 한 줄이 마디 줄이면 읽기 낱말들의 위치를 돌려준다(낱말 2개 이상, per+1개 이하, 설명 줄 제외). 아니면 null. */
function scanLine(raw: string, entries: BeatEntry[], per: number): Tok[] | null {
  if (EXPLAIN.test(raw)) return null;
  const words = withAliases(entries).sort((a, b) => b.word.length - a.word.length);
  let rest = raw;
  const toks: Tok[] = [];
  for (const e of words) {
    const re = new RegExp(`(?<![가-힣A-Za-z])${esc(e.word)}(?![가-힣A-Za-z])`, "g");
    rest = rest.replace(re, (m, off: number) => {
      const before = raw.slice(0, off);
      const ann = /\(\d+\s*박\)\s*$/.exec(before);
      toks.push({ at: off, end: off + m.length, e, ...(ann ? { annAt: ann.index } : {}) });
      return " ".repeat(m.length);
    });
  }
  toks.sort((a, b) => a.at - b.at);
  return toks.length >= 2 && toks.length <= per + 1 ? toks : null;
}

export interface RhythmReport {
  measures: { n: number; words: string[]; beats: number }[];
  wrongSum: { n: number; words: string[]; beats: number }[];
  repeated: string[];
  /** 읽기 낱말이 한 마디도 없다 — 표를 안 쓰고 자기 표기를 지어 냈다. */
  noTableWords: boolean;
}

const headNo = (raw: string) => /^\s*(?:\d+\s*[.)]\s*)?\(?(?:마디\s*)?(\d{1,2})\s*(?:마디)?\s*[):.]/.exec(raw);

/** 모델이 마디를 줄바꿈 없이 한 줄에 "1마디 | … 2마디 | …"로 이어 쓰는 일이 잦다 — "N마디" 표지가 둘 이상이면 표지마다 잘라 한 마디씩 본다. */
function unitsOf(raw: string): { off: number; text: string }[] {
  const starts = [...raw.matchAll(/(?<![\d가-힣])(\d{1,2})\s*마디\s*(?=[|:：(])/g)].map((m) => m.index ?? 0);
  if (starts.length < 2) return [{ off: 0, text: raw }];
  const cuts = starts[0] === 0 ? starts : [0, ...starts];
  return cuts.map((at, k) => ({ off: at, text: raw.slice(at, cuts[k + 1] ?? raw.length) }));
}

interface Unit {
  li: number;
  off: number;
  text: string;
  toks: Tok[];
}

function measureUnits(lines: string[], entries: BeatEntry[], per: number): Unit[] {
  const out: Unit[] = [];
  lines.forEach((raw, li) => {
    for (const u of unitsOf(raw)) {
      const toks = scanLine(u.text, entries, per);
      if (toks) out.push({ li, off: u.off, text: u.text, toks });
    }
  });
  return out;
}

export function checkRhythm(content: string, entries: BeatEntry[], per: number): RhythmReport {
  const units = measureUnits((content ?? "").split("\n"), entries, per);
  const measures: RhythmReport["measures"] = units.map((u, k) => {
    const head = headNo(u.text);
    return { n: head ? Number(head[1]) : k + 1, words: u.toks.map((t) => t.e.word), beats: u.toks.reduce((a, t) => a + t.e.beats, 0) };
  });
  const wrongSum = measures.filter((m) => m.beats !== per);
  const count = new Map<string, number[]>();
  measures.forEach((m) => count.set(m.words.join(" "), [...(count.get(m.words.join(" ")) ?? []), m.n]));
  const repeated = [...count].filter(([, ns]) => ns.length >= 3).map(([k, ns]) => `${ns.join("·")}마디: ${k}`);
  return { measures, wrongSum, repeated, noTableWords: measures.length === 0 };
}

/** 박 합이 per가 되게 최소로 고친다: 넘치면 뒤에서부터 빼고(빼면 모자라는 2박 낱말은 1박 낱말로 바꾸고), 모자라면 1박 낱말을 덧붙인다. */
function fitBeats(words: BeatEntry[], entries: BeatEntry[], per: number): BeatEntry[] {
  const out = [...words];
  const sum = () => out.reduce((a, w) => a + w.beats, 0);
  const ones = entries.filter((e) => e.beats === 1);
  const fresh = () => ones.find((o) => !out.includes(o)) ?? ones[0];
  while (sum() > per && out.length > 1) {
    const last = out[out.length - 1];
    if (sum() - last.beats >= per) out.pop();
    else if (last.beats > 1 && ones.length > 0) out[out.length - 1] = fresh();
    else out.pop();
  }
  while (sum() < per && ones.length > 0) out.push(fresh());
  return out;
}

/** 같은 낱말 조합이 세 번째 이상 나오면 같은 박의 다른 낱말로 한 자리를 돌려 서로 다르게 한다(박 합은 그대로). */
function varyRepeats(rows: BeatEntry[][], entries: BeatEntry[]): BeatEntry[][] {
  const seen = new Map<string, number>();
  const key = (r: BeatEntry[]) => r.map((w) => w.word).join(" ");
  let prev = "";
  return rows.map((r) => {
    let cur = r;
    // 세 번째 되풀이이거나 바로 앞 마디와 같으면("같은 리듬이 계속 반복") 바꾼다.
    for (let tries = 0; tries < 12 && ((seen.get(key(cur)) ?? 0) >= 2 || key(cur) === prev); tries++) {
      const i = tries % cur.length;
      const alts = entries.filter((e) => e.beats === cur[i].beats && e.word !== cur[i].word);
      if (alts.length === 0) continue;
      cur = cur.map((w, j) => (j === i ? alts[(tries + seen.size) % alts.length] : w));
    }
    seen.set(key(cur), (seen.get(key(cur)) ?? 0) + 1);
    prev = key(cur);
    return cur;
  });
}

/**
 * 마디의 박 합을 코드로 맞추고 같은 조합의 되풀이를 줄인다(모델 호출 없음, 멱등). 마디 번호·가사와 구분 기호·"(2박)" 표기 형식은 그대로 둔다.
 * 왜 코드인가: 모델은 틀린 마디를 짚어 주고 다시 쓰게 해도 거의 안 고쳤다(11-24 실측: 보완이 10자만 바꿈). 박 합은 표로 정해지는 산수라 코드가 정확하다.
 */
export function fixRhythm(content: string, entries: BeatEntry[], per: number): { content: string; fixedSums: number; varied: number } {
  const lines = (content ?? "").split("\n");
  const units = measureUnits(lines, entries, per);
  if (units.length === 0) return { content, fixedSums: 0, varied: 0 };
  const same = (a: BeatEntry[], b: BeatEntry[]) => a.map((w) => w.word).join() === b.map((w) => w.word).join();
  const orig = units.map((u) => u.toks.map((x) => x.e));
  const fitted = orig.map((ws) => (ws.reduce((a, w) => a + w.beats, 0) === per ? ws : fitBeats(ws, entries, per)));
  const fixedSums = fitted.filter((f, k) => !same(f, orig[k])).length;
  const varied = varyRepeats(fitted, entries);
  let changedVar = 0;
  const edits = new Map<number, { off: number; end: number; text: string }[]>();
  units.forEach((u, k) => {
    if (same(varied[k], orig[k])) return;
    if (!same(fitted[k], varied[k])) changedVar++;
    const t = u.toks;
    const annotated = t.every((x) => x.annAt !== undefined);
    const start = t[0].annAt ?? t[0].at;
    const gap = u.text.slice(t[0].end, t[1].annAt ?? t[1].at);
    const sep = gap.length > 0 && gap.length <= 6 && !/[가-힣A-Za-z]/.test(gap) ? gap : " / ";
    const body = varied[k].map((w) => (annotated ? `(${w.beats}박)${w.word}` : w.word)).join(sep);
    edits.set(u.li, [...(edits.get(u.li) ?? []), { off: u.off + start, end: u.off + t[t.length - 1].end, text: body }]);
  });
  for (const [li, list] of edits) for (const e of list.sort((x, y) => y.off - x.off)) lines[li] = lines[li].slice(0, e.off) + e.text + lines[li].slice(e.end);
  return { content: lines.join("\n"), fixedSums, varied: changedVar };
}
