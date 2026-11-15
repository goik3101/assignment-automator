// screen-dump가 저장한 "학생 화면" 파일 전체를 기계로 점검한다(모델 호출 없음, 비용 0).
// 과제 유형별 규칙이 아니라 **어느 안내문에나 틀린 것**만 본다: 경고·배너, 빈 소제목, 번호 자리표시 소제목,
// 채점 문구·작업 메모 잔여, 값 칸에 문장, 칸 밖 제작 참고, 같은 문장 되풀이, 빈칸 과다, 각주 없는 수치.
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/screen-lint.ts [폴더=scratchpad/measure/screen] [파일 필터]
import fs from "node:fs";
import path from "node:path";

const { findValueFieldOverflows } = await import("@/lib/essay/bibliographic-fields");

const dir = process.argv[2] ?? path.join(process.cwd(), "scratchpad", "measure", "screen");
const filter = process.argv[3];
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md") && (!filter || f.includes(filter))).sort();

interface Card {
  label: string;
  lines: string[];
  banner: boolean;
  warnings: string[];
  notes: string[];
}

function parse(text: string): { head: string; cards: Card[]; global: string[] } {
  const lines = text.split("\n");
  const cards: Card[] = [];
  const global: string[] = [];
  let cur: Card | null = null;
  for (const l of lines) {
    const m = /^=+ 카드: (.+?) =+$/.exec(l);
    if (m) {
      cur = { label: m[1], lines: [], banner: false, warnings: [], notes: [] };
      cards.push(cur);
      continue;
    }
    if (/^=+ 외부 제작 계획 =+$/.test(l)) {
      cur = { label: "외부 제작 계획", lines: [], banner: false, warnings: [], notes: [] };
      cards.push(cur);
      continue;
    }
    if (!cur) {
      if (l.startsWith("▣")) global.push(l);
      continue;
    }
    if (l.startsWith("▣ 배너")) cur.banner = true;
    else if (l.startsWith("▣ 경고")) cur.warnings.push(l);
    else if (l.startsWith("▣ 제작 참고")) cur.notes.push(l);
    else if (l.startsWith("▣") || l.startsWith("전체 출처")) continue;
    else cur.lines.push(l);
  }
  return { head: lines[0] ?? "", cards, global };
}

const META = [
  [/\((?:[^()\n\d\[\]:：]{2,24}?(?:설명|근거|서술|제시))\)/, "채점 문구 괄호"],
  [/^\s*제작\s*참고\s*[:：]/m, "본문 속 제작 참고 줄"],
  [/가상\s*(?:의\s*)?(?:인물|주민|시민)(?:이다|을|를|과|와)|가상\s*인물로\s*설정/, "'가상 인물' 메타"],
  [/(?:아래|위)는\s*.{0,20}(?:예시|초안)|참고해\s*(?:줘|라)|도움이\s*되길|궁금한\s*점이\s*있으면/, "말 거는 문장"],
  [/\[(?:자료|해석|근거 표시)\]|\(근거 표시\)/, "작업 표기"],
  [/원문을\s*(?:보내|알려)\s*주시면|제공되지\s*않아\s*작성할\s*수\s*없/, "거절문"],
  // 참고문헌·출처 목록 양식(줄 앞 "- 제목: 주소", "[1] …")의 주소는 정상이다 — 서술 문장 속 주소만 센다.
  [/^(?!\s*(?:[-*•]|\[\d+\]))[^\n]*https?:\/\//m, "본문 속 주소"],
] as const;

const rows: string[] = [];
let totalIssues = 0;
const byKind = new Map<string, number>();
const bump = (k: string) => byKind.set(k, (byKind.get(k) ?? 0) + 1);

for (const f of files) {
  const { head, cards, global } = parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const issues: string[] = [];
  const add = (kind: string, detail: string) => {
    issues.push(`${kind}: ${detail}`);
    bump(kind);
  };
  for (const g of global) add("경고·배너", g.slice(2, 60));
  const seen = new Map<string, string>();
  for (const c of cards) {
    const body = c.lines.join("\n");
    if (c.banner) add("경고·배너", `${c.label} 검증 안 됨 배너`);
    for (const w of c.warnings) add("경고·배너", `${c.label} ${w.slice(2, 50)}`);
    // 빈 소제목 / 번호 자리표시 소제목
    const ls = c.lines;
    for (let i = 0; i < ls.length; i++) {
      const h = /^#{2,4}\s+(.+?)\s*$/.exec(ls[i]);
      if (!h) continue;
      let j = i + 1;
      while (j < ls.length && !ls[j].trim()) j++;
      if (j >= ls.length || /^#{2,4}\s/.test(ls[j])) add("빈 소제목", `${c.label} / ${h[1]}`);
      if (/^(?:칸|컷|장면|문항|문제)\s*\d+$/.test(h[1].replace(/\*+/g, "").trim()) && j < ls.length && /^#{2,4}\s/.test(ls[j])) add("번호 자리표시 소제목", `${c.label} / ${h[1]}`);
    }
    for (const [re, name] of META) if (re.test(body)) add("잔여물", `${c.label} ${name}`);
    for (const v of findValueFieldOverflows(body)) add("값 칸에 문장", `${c.label} / ${v.name}`);
    const blanks = (body.match(/\[직접\s*작성[^\]]*\]/g) ?? []).length;
    if (blanks > 8) add("빈칸 과다", `${c.label} ${blanks}개`);
    // 같은 문장 되풀이(카드 사이)
    for (const s of body.replace(/\[\d+(?:,\s*\d+)*\]/g, "").split(/(?<=[.!?。])\s+/)) {
      const t = s.replace(/\s+/g, " ").trim();
      if (t.length < 24 || /^[#|>-]/.test(t)) continue;
      const prev = seen.get(t);
      if (prev && prev !== c.label) add("카드 사이 같은 문장", `${prev} ↔ ${c.label}: ${t.slice(0, 30)}…`);
      else seen.set(t, c.label);
    }
    // 각주가 하나도 없는데 연도·수치가 있는 문장(사실 주장 후보) — 자기 기록 칸은 제외
    if (!/\[\d+/.test(body) && !c.banner) {
      const n = (body.match(/\d{4}년|\d+(?:\.\d+)?\s*%|\d{1,3}(?:,\d{3})+\s*(?:명|원|건)/g) ?? []).length;
      if (n >= 3 && !/\[직접 작성/.test(body)) add("각주 없는 수치", `${c.label} ${n}곳`);
    }
  }
  totalIssues += issues.length;
  const secs = /생성 ([\d.]+)초/.exec(head)?.[1] ?? "?";
  const chars = cards.reduce((n, c) => n + c.lines.join("").replace(/\[\d+(?:,\s*\d+)*\]|\s/g, "").length, 0);
  rows.push(`${f.replace(/\.md$/, "").padEnd(14)} 생성 ${String(secs).padStart(5)}초 · 본문 ${String(chars).padStart(5)}자 · 문제 ${issues.length}${issues.length ? "\n    - " + issues.join("\n    - ") : ""}`);
}
console.log(rows.join("\n"));
console.log(`\n== 안내문 ${files.length}건 · 문제 ${totalIssues}개 · 문제 없는 것 ${rows.filter((r) => /문제 0$|문제 0\n/.test(r)).length}건`);
console.log([...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" | "));
