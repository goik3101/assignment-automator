// 지금까지 생성된 모든 결과물(저장된 .md + 사용자가 보내 준 결과물.N.txt)에 알려진 결함 검사기를 한 번에 돌린다.
// 하나씩 발견해 고치는 방식을 멈추고 "무엇이 몇 번 나오는지"를 먼저 세기 위한 것. 모델 호출 없음.
// 사용: node --import ./scripts/measure/loader/register.mjs scratchpad/measure/scan.ts
import fs from "node:fs";
import path from "node:path";
import { findOwnActivitySentences, countBlanks } from "@/lib/essay/own-activity";
import { isPlanSentence } from "@/lib/essay/plan-citations";
import { hasDataTable } from "@/lib/essay/data-visual";
import { isLandingPage } from "@/lib/essay/research-notes";
import { findRepeatedStatements } from "@/lib/essay/repetition";
import { findRefusalSentences } from "@/lib/essay/refusal";

const OUT = path.join(process.cwd(), "scratchpad", "measure", "out");
const USER = path.join(process.cwd(), "수행평가 안내문");

interface Check {
  name: string;
  /** 그 글에서 발견된 횟수(0이면 정상) */
  find: (text: string) => number;
}

/**
 * 본문만 남긴다 — 맨 아래 "출처"·"근거자료 출처" 목록과 주소가 붙은 목록 줄은 본문 문장이 아니다.
 * 실측(2026-10-31): 최신 코드로 만든 글 6편이 찍은 결함이 전부 이 줄들이었다
 * ("120자 넘는 긴 문장"=긴 주소, "무각주 수치"=출처 제목 속 연도, "본문에 날 URL"=안내문이 요구한 출처 항목).
 */
const bodyOnly = (t: string) => {
  const out: string[] = [];
  let inSources = false;
  for (const line of t.split("\n")) {
    if (/^#{2,4}\s/.test(line)) inSources = /출처|참고\s*자료|references/i.test(line);
    if (inSources) continue;
    if (/^\s*[-*•]?\s*\S.*:\s*https?:\/\//.test(line)) continue; // "제목: https://…" 목록 줄
    out.push(line);
  }
  return out.join("\n");
};

const sentences = (t: string) =>
  bodyOnly(t)
    .split("\n")
    .filter((l) => !/^\s*(?:#|\|)/.test(l))
    // 각주가 마침표 뒤에 붙으면("판결했다.[1] 다음 문장") 공백만으로는 안 나뉜다 — 각주까지 포함해 끊는다.
    .flatMap((l) => l.split(/(?<=[.!?。](?:\[\d+\])*)\s+/))
    .map((s) => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter((s) => s.length >= 8);

const checks: Check[] = [
  { name: "하지 않은 활동을 했다고 씀", find: (t) => findOwnActivitySentences(t).length },
  { name: "계획 문장에 각주", find: (t) => sentences(t).filter((s) => /\[\d+\]/.test(s) && isPlanSentence(s.replace(/\[\d+\]\s*$/, ""))).length },
  { name: "빈칸 4개 이상", find: (t) => (countBlanks(t) > 3 ? 1 : 0) },
  { name: "본문에 날 URL", find: (t) => (bodyOnly(t).match(/^[^|]*https?:\/\/\S+/gm) ?? []).length },
  { name: "기관 첫 화면을 출처로", find: (t) => (t.match(/https?:\/\/\S+/g) ?? []).filter((u) => isLandingPage(u.replace(/[.,)]+$/, ""))).length },
  { name: "탭으로 맞춘 표(표로 안 보임)", find: (t) => t.split("\n").filter((l) => /\t/.test(l) && l.split("\t").length >= 2 && !/^\s*\|/.test(l)).length },
  { name: "소제목에 작성 지시 노출", find: (t) => (t.match(/^#{2,4}[^\n]*[(（][^)）\n]*(?:제출용|조사\s*자료|항목마다|문단으로)[^)）\n]*[)）]/gm) ?? []).length },
  { name: "작업 설명 문장", find: (t) => sentences(t).filter((s) => /^\(?\s*(?:근거|출처)\s*(?:표시|표기|안내)\s*\)|수행평가지에\s*(?:첨부|정리)할\s*파일/.test(s)).length },
  { name: "못 하겠다고 쓴 거절문", find: (t) => findRefusalSentences(bodyOnly(t)).length },
  { name: "[확인 필요] 본문 노출", find: (t) => (t.match(/\[확인 필요\]/g) ?? []).length },
  { name: "서술형 각주 깨짐([1],.)", find: (t) => (t.match(/\[\d+\]\s*,\s*[.!?]/g) ?? []).length },
  { name: "수치 문장에 각주 없음", find: (t) => sentences(t).filter((s) => /\d{3,4}년|\d+(?:\.\d+)?\s*%|\d+\s*㎍|\d{1,3},\d{3}/.test(s) && !/\[\d+\]/.test(s)).length },
  { name: "같은 문장 되풀이", find: (t) => findRepeatedStatements(t.split(/^## /m).filter(Boolean).map((s) => ({ label: s.split("\n")[0], content: s }))).length },
  { name: "금지 자료(사진·영상) 언급", find: (t) => t.split("\n").filter((l) => /화면 설명|시각 자료|이미지/.test(l) && /사진|영상|동영상/.test(l)).length },
  { name: "표가 있어야 하는데 없음(표 언급만)", find: (t) => (/그래프|표로|도표/.test(t) && !hasDataTable(t) ? 1 : 0) },
  // ── 아직 본 적 없는 것들도 함께 센다(숨은 결함 찾기) ──
  // 소제목 다음에 빈 줄이 오면 /$/가 m 플래그에서 그 빈 줄에 걸려 "내용 없음"으로 세던 버그를 고쳤다(2026-10-31).
  { name: "소제목만 있고 내용이 빈 항목", find: (t) => (t.match(/^###[^\n]*\n(?:[ \t]*\n)*(?=#{2,3}\s|(?![\s\S]))/gm) ?? []).length },
  { name: "같은 각주가 붙어서 중복([1][1])", find: (t) => (t.match(/\[(\d+)\]\[\1\]/g) ?? []).length },
  { name: "출처 목록에 없는 각주 번호", find: (t) => {
      const maxN = Math.max(0, ...[...t.matchAll(/^\s*\[(\d+)\]\s*$|^\[(\d+)\]/gm)].map((m) => Number(m[1] ?? m[2])));
      if (!maxN) return 0;
      return [...new Set([...t.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))].filter((n) => n > maxN).length;
    } },
  { name: "소제목 중복", find: (t) => {
      const h = [...t.matchAll(/^###\s+(.+)$/gm)].map((m) => m[1].trim());
      return h.length - new Set(h).size;
    } },
  { name: "문장이 끝나지 않고 끊김", find: (t) => t.split("\n").filter((l) => /[가-힣](?:은|는|이|가|을|를|의|에|와|과|로|으로)\s*$/.test(l.trim()) && l.trim().length > 15 && !/^\s*[#|]/.test(l)).length },
  { name: "한국어 글에 영어 문장", find: (t) => t.split("\n").filter((l) => !/^\s*[#|]/.test(l) && !/https?:/.test(l) && /[A-Za-z]{4,}\s+[A-Za-z]{4,}\s+[A-Za-z]{4,}/.test(l)).length },
  { name: "한자·외국 문자 섞임", find: (t) => (t.replace(/\([^)]*\)/g, "").match(/[一-鿿؀-ۿЀ-ӿ]/g) ?? []).length },
  { name: "AI·프롬프트 같은 메타 낱말", find: (t) => (t.match(/프롬프트|AI가 작성|인공지능이 (?:작성|썼)|지시문|시스템이 (?:붙|채)/g) ?? []).length },
  { name: "출처 1개에 각주 8개 이상 몰림", find: (t) => {
      const ns = [...t.matchAll(/\[(\d+)\]/g)].map((m) => m[1]);
      if (ns.length < 8) return 0;
      const c = new Map<string, number>();
      for (const n of ns) c.set(n, (c.get(n) ?? 0) + 1);
      return new Set(ns).size === 1 ? 1 : 0;
    } },
  { name: "120자 넘는 긴 문장", find: (t) => sentences(t).filter((s) => s.replace(/\[\d+\]/g, "").length > 120).length },
];

const files: { id: string; text: string }[] = [];
for (const f of fs.readdirSync(OUT).filter((f) => f.endsWith(".md") && !f.startsWith("report-"))) {
  files.push({ id: f, text: fs.readFileSync(path.join(OUT, f), "utf8") });
}
for (const f of fs.existsSync(USER) ? fs.readdirSync(USER).filter((f) => /^결과물.*\.txt$/.test(f)) : []) {
  files.push({ id: f, text: fs.readFileSync(path.join(USER, f), "utf8") });
}

/** 언제 만든 글인가 — 오늘 고친 코드 이후 것만 보면 지금 남은 문제를 알 수 있다. */
const era = (id: string) =>
  /^(v1|plan-v1)/.test(id) ? "오늘 고친 코드" : /결과물/.test(id) ? "사용자 실제 결과물" : "오늘 이전 코드";

const totals = new Map<string, { runs: number; hits: number; worst: string }>();
const byEra = new Map<string, Map<string, number>>();
const eraCount = new Map<string, number>();
for (const { id, text } of files) {
  eraCount.set(era(id), (eraCount.get(era(id)) ?? 0) + 1);
  for (const c of checks) {
    const n = c.find(text);
    const cur = totals.get(c.name) ?? { runs: 0, hits: 0, worst: "" };
    if (n > 0) {
      cur.runs++;
      cur.hits += n;
      if (!cur.worst) cur.worst = `${id}(${n})`;
      const e = byEra.get(era(id)) ?? new Map<string, number>();
      e.set(c.name, (e.get(c.name) ?? 0) + 1);
      byEra.set(era(id), e);
    }
    totals.set(c.name, cur);
  }
}

console.log(`검사한 결과물 ${files.length}편\n`);
console.log("| 결함 | 나온 글 | 총 건수 | 예 |");
console.log("|---|---|---|---|");
for (const [name, v] of [...totals.entries()].sort((a, b) => b[1].runs - a[1].runs)) {
  console.log(`| ${name} | ${v.runs}편 | ${v.hits} | ${v.worst || "-"} |`);
}

for (const [e, m] of byEra) {
  console.log(`\n### ${e} (${eraCount.get(e)}편) — 몇 편에서 나왔나`);
  for (const [n, c] of [...m.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(2)}편  ${n}`);
}
