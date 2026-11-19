// 단계(카드) 사이에서 앞 단계 문장을 되풀이한 정도를 잰다 — 모델 호출 0, 비용 0.
// 왜: 사용자 개선 요청(2026-11-19, ChatGPT 의견 4번)이 "1차시·2차시·4차시가 같은 조언·위로를 되풀이한다"고 했다.
// 어느 문장이 앞 카드에 이미 있는 말인가 = 그 문장의 글자 4연쇄가 앞 카드 글에 THRESHOLD 이상 들어 있다.
// 같은 안내문을 사진+한 줄로 쓴 기준선(screen_bare)과 같은 잣대로 비교할 수 있다.
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/cross-step-audit.ts [폴더=scratchpad/measure/screen] [예시 출력 수=0]
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2] ?? path.join(process.cwd(), "scratchpad", "measure", "screen");
const showExamples = Number(process.argv[3] ?? 0);
const THRESHOLD = 0.6;
const N = 4;

function cardsOf(md: string): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = [];
  let cur: { label: string; text: string } | null = null;
  for (const line of md.split(/\r?\n/)) {
    const m = /^=+ 카드: (.+?) =+$/.exec(line);
    if (m) {
      cur = { label: m[1], text: "" };
      out.push(cur);
      continue;
    }
    if (/^=+ 외부 제작 계획/.test(line)) { cur = null; continue; }
    if (cur && !line.startsWith("▣") && !line.startsWith("전체 출처")) cur.text += `${line}\n`;
  }
  return out;
}

const norm = (s: string) => s.replace(/\[\d+\]|\[F\d+\]/g, "").replace(/[^가-힣a-zA-Z0-9]/g, "");
const grams = (s: string): Set<string> => {
  const t = norm(s);
  const g = new Set<string>();
  for (let i = 0; i + N <= t.length; i++) g.add(t.slice(i, i + N));
  return g;
};
const sentences = (text: string) =>
  text
    .split(/\r?\n/)
    .filter((l) => !/^#{1,6}\s/.test(l))
    .flatMap((l) => l.split(/(?<=[.!?。])\s+/))
    .map((s) => s.trim())
    .filter((s) => norm(s).length >= 14);

// ── 말만 바꾼 되풀이(의미 되풀이) ─────────────────────────────────────────────────────────────────
// 4글자 연쇄는 문장 복사만 잡는다(2026-11-19: 책 처방전 2·3·4차시가 "짧은 인사 한마디부터, 실패라고 단정하지 않기"를 세 번 말했는데 0%로 나왔다).
// 그래서 **낱말 겹침**도 잰다: 뒤 카드의 내용어(조사 뗀 2음절 이상 낱말) 중 앞 카드에도 나온 비율.
// 같은 주제의 카드끼리는 원래 어휘가 겹치므로, 다른 안내문 카드와의 겹침을 **잡음 기준선**으로 함께 찍는다(기준선보다 얼마나 높은가가 신호).
const JOSA = /(?:으로|에서|에게|까지|부터|처럼|보다|이라|라고|이며|하게|하는|하고|한다|했다|이다|은|는|이|가|을|를|의|에|도|로|와|과|만|께)$/;
const words = (text: string): Set<string> => {
  const out = new Set<string>();
  for (const w of text.replace(/\[\d+\]|\[F\d+\]/g, " ").split(/[^가-힣]+/)) {
    let x = w;
    if (x.length >= 3) x = x.replace(JOSA, "");
    if (x.length >= 2) out.add(x);
  }
  return out;
};
const overlap = (later: Set<string>, earlier: Set<string>) => {
  if (later.size === 0) return 0;
  let hit = 0;
  for (const w of later) if (earlier.has(w)) hit++;
  return hit / later.size;
};
const allCards = new Map<string, { label: string; words: Set<string> }[]>();
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".md")).sort()) {
  allCards.set(f.replace(/\.md$/, ""), cardsOf(fs.readFileSync(path.join(dir, f), "utf8")).filter((c) => norm(c.text).length > 80).map((c) => ({ label: c.label, words: words(c.text) })));
}
const lexRows: string[] = [];
let lexSum = 0;
let lexBase = 0;
let lexN = 0;
for (const [id, cards] of allCards) {
  if (cards.length < 2) continue;
  const others = [...allCards].filter(([k]) => k !== id).flatMap(([, v]) => v);
  const baseUnion = new Set<string>();
  for (const c of others.slice(0, 6)) for (const w of c.words) baseUnion.add(w); // 다른 안내문 카드 6장의 합집합(앞 카드 수와 비슷한 크기)
  const parts: string[] = [];
  for (let i = 1; i < cards.length; i++) {
    const before = new Set<string>();
    for (let j = 0; j < i; j++) for (const w of cards[j].words) before.add(w);
    // 기준선은 앞 카드와 같은 크기의 무작위 다른 안내문 어휘와 비교하도록, 앞 카드 어휘 수만큼만 기준 합집합에서 잘라 쓴다.
    const baseSlice = new Set([...baseUnion].slice(0, before.size));
    const o = overlap(cards[i].words, before);
    const b = overlap(cards[i].words, baseSlice);
    parts.push(`${Math.round(o * 100)}%(기준 ${Math.round(b * 100)}%)`);
    lexSum += o;
    lexBase += b;
    lexN++;
  }
  lexRows.push(`${id.padEnd(14)} 낱말 겹침: ${parts.join(" · ")}`);
}

let totalSent = 0;
let totalRep = 0;
let multi = 0;
const rows: string[] = [];
const examples: string[] = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".md")).sort()) {
  const id = f.replace(/\.md$/, "");
  const cards = cardsOf(fs.readFileSync(path.join(dir, f), "utf8")).filter((c) => norm(c.text).length > 80);
  if (cards.length < 2) continue;
  multi++;
  let sent = 0;
  let rep = 0;
  for (let i = 1; i < cards.length; i++) {
    const before = new Set<string>();
    for (let j = 0; j < i; j++) for (const g of grams(cards[j].text)) before.add(g);
    for (const s of sentences(cards[i].text)) {
      const g = grams(s);
      if (g.size === 0) continue;
      sent++;
      let hit = 0;
      for (const x of g) if (before.has(x)) hit++;
      if (hit / g.size >= THRESHOLD) {
        rep++;
        if (examples.length < showExamples) examples.push(`  [${id} / ${cards[i].label}] ${s.slice(0, 90)}`);
      }
    }
  }
  totalSent += sent;
  totalRep += rep;
  rows.push(`${id.padEnd(14)} 카드 ${cards.length}개 · 뒤 카드 문장 ${String(sent).padStart(3)} · 앞 카드와 겹침 ${String(rep).padStart(3)} (${sent ? Math.round((rep / sent) * 100) : 0}%)`);
}
console.log(rows.join("\n"));
console.log(`\n여러 카드 안내문 ${multi}건 · 뒤 카드 문장 ${totalSent}개 중 앞 카드와 겹침 ${totalRep}개 (${totalSent ? Math.round((totalRep / totalSent) * 100) : 0}%)  [겹침 기준: 4글자 연쇄 ${THRESHOLD * 100}% 이상이 앞 카드에 있음]`);
if (lexN) {
  console.log(`\n${lexRows.join("\n")}`);
  console.log(`낱말 겹침 평균 ${Math.round((lexSum / lexN) * 100)}% (같은 크기의 다른 안내문 어휘 기준선 ${Math.round((lexBase / lexN) * 100)}%) — 기준선보다 훨씬 높고 카드 역할이 달라야 하는데 높으면 말만 바꾼 되풀이를 의심한다.`);
}
if (examples.length) console.log(`\n예시:\n${examples.join("\n")}`);
