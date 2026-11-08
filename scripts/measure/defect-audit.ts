// 결함 검사기 15종을 **저장된 결과물 전부**에 돌린다. 모델 호출 없음(비용 0).
//
// 왜: 검사기가 틀리면 멀쩡한 단계를 다시 쓰게 만들어 오히려 품질을 깎는다.
// 실측(2026-11-03): 날조 검사기가 "유엔 위원단이 북한 지역을 방문하지 못했다.[2]"를 학생 행동으로 잡았다.
// 그래서 "몇 건 걸렸나"가 아니라 **무엇이 걸렸는지 문장을 찍어** 사람이 거짓 양성을 가려낼 수 있게 한다.
//
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/defect-audit.ts [최대표본]
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));

const { findOwnActivitySentences, countBlanks } = await import("@/lib/essay/own-activity");
const { findRefusalSentences } = await import("@/lib/essay/refusal");
const { findRepeatedStatements } = await import("@/lib/essay/repetition");
const { isPlanSentence } = await import("@/lib/essay/plan-citations");
const { findUsePlanSentences, evidenceSectionText } = await import("@/lib/essay/evidence-items");
const { findSourceVoiceSentences } = await import("@/lib/essay/source-voice");
const { isLandingPage } = await import("@/lib/essay/research-notes");
const { isAsciiArt } = await import("@/lib/essay/ascii-art");

const OUT = path.join(REPO, "scratchpad/measure/out");
const files = fs.readdirSync(OUT).filter((f) => f.endsWith(".md"));
const limit = Number(process.argv[2] ?? files.length);

/** 맨 아래 출처 목록은 본문이 아니다 — 안 떼면 긴 주소가 "긴 문장", 출처 제목의 연도가 "무각주 수치"로 잡힌다. */
function body(md: string): string {
  const at = md.search(/\n##\s*출처\s*\n/);
  return at >= 0 ? md.slice(0, at) : md;
}
const sentences = (t: string) =>
  t.split("\n").filter((l) => !/^\s*(?:#|\|)/.test(l)).flatMap((l) => l.split(/(?<=[.!?。](?:\[\d+\])*)\s+/)).map((s) => s.trim()).filter((s) => s.length >= 8);

interface Hit { file: string; text: string }
const hits: Record<string, Hit[]> = {};
const add = (k: string, file: string, text: string) => (hits[k] ??= []).push({ file, text: text.replace(/\s+/g, " ").slice(0, 110) });

let n = 0;
for (const f of files.slice(0, limit)) {
  const md = fs.readFileSync(path.join(OUT, f), "utf8");
  if (md.trim().length < 200) continue;
  n++;
  const b = body(md);
  for (const s of findOwnActivitySentences(b)) add("날조 활동", f, s);
  for (const s of findRefusalSentences(b)) add("거절문", f, s);
  const blanks = countBlanks(b);
  if (blanks > 4) add("빈칸 과다", f, `${blanks}개`);
  for (const s of sentences(b)) {
    if (/\d{3,4}년|\d+(?:\.\d+)?\s*%/.test(s) && !/\[\d+\]/.test(s) && !/https?:/.test(s)) add("무각주 수치", f, s);
    if (/\[\d+\]/.test(s) && isPlanSentence(s.replace(/\[\d+\]\s*$/, ""))) add("계획 문장 각주", f, s);
    if (s.length > 300) add("끊긴·긴 문장", f, s);
    if (/[一-鿿぀-ヿ]/.test(s)) add("외국 문자", f, s);
  }
  for (const s of findUsePlanSentences(evidenceSectionText(b) ?? "")) add("쓰임 설명", f, s);
  for (const s of findSourceVoiceSentences(b, [])) add("출처의 말", f, String((s as { text?: string }).text ?? s));
  const secs = b.split(/\n(?=##\s)/).map((x) => ({ label: (x.match(/^##\s*(.+)$/m)?.[1] ?? "").trim(), content: x }));
  for (const p of findRepeatedStatements(secs)) add("되풀이", f, p.b.text);
  for (const m of b.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) if (isAsciiArt(m[1])) add("아스키 아트", f, m[1]);
  for (const m of b.matchAll(/^\s*\[\d+\]\s*\S+\s+—\s+(https?:\S+)/gm)) if (isLandingPage(m[1])) add("기관 첫 화면 출처", f, m[1]);
}

console.log(`\n=== 저장된 결과물 ${n}편 전수 ===\n`);
const names = Object.keys(hits).sort((a, b) => hits[b].length - hits[a].length);
for (const k of names) {
  const list = hits[k];
  const fileCount = new Set(list.map((h) => h.file)).size;
  console.log(`## ${k} — ${list.length}건 / ${fileCount}편`);
  for (const h of list.slice(0, 3)) console.log(`   · ${h.text}`);
  if (list.length > 3) { if (process.env.DA_ALL === "on") for (const x of list.slice(3)) console.log("   ·", typeof x === "string" ? x : JSON.stringify(x)); else console.log(`   … 외 ${list.length - 3}건`); }
}
if (names.length === 0) console.log("걸린 것 없음");
