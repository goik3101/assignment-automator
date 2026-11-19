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
if (examples.length) console.log(`\n예시:\n${examples.join("\n")}`);
