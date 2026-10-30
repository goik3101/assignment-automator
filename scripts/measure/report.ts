// 저장된 측정 결과(JSON)를 지표로 정리한다(모델 호출 없음 — 몇 번이고 다시 돌릴 수 있다).
// 사용: node --import ./scripts/measure/loader/register.mjs scratchpad/measure/report.ts <태그>
import fs from "node:fs";
import path from "node:path";
import { countScenes } from "@/lib/essay/form-requirements";
import { findRepeatedStatements } from "@/lib/essay/repetition";
import type { EssayResult } from "@/types/task";

const OUT = path.join(process.cwd(), "scratchpad", "measure", "out");
const tag = process.argv[2] ?? "ab1";

interface Record_ {
  id: string;
  arm: "off" | "on";
  wallMs: number;
  usage: { estimatedCostUsd: number; searchCalls: number; calls: number; byLabel?: Record<string, { calls: number; ms: number }> };
  result: EssayResult | { type: "insufficient_data"; reason: string };
  logs: string[];
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** "### 소제목" 블록에서 항목 하나의 본문만 꺼낸다. */
function blockOf(markdown: string, heading: RegExp): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => /^###(?!#)/.test(l) && heading.test(l));
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{2,3}(?!#)/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n").trim();
}

const marks = (t: string) => [...new Set([...t.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))];
const numsOf = (t: string) =>
  new Set([...t.matchAll(/(?<![\d.,])(1[0-9]{3}|20[0-9]{2})(?![\d])|\d+(?:\.\d+)?\s?%/g)].map((m) => m[0].replace(/\s/g, "")));

const rows: string[] = [];
const dump: string[] = [];
const files = fs.readdirSync(OUT).filter((f) => f.startsWith(`${tag}-`) && f.endsWith(".json")).sort();

for (const f of files) {
  const rec = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")) as Record_;
  if (rec.result.type !== "essay") {
    rows.push(`| ${rec.id} | 생성 실패 | | | | | | | |`);
    continue;
  }
  const r = rec.result;
  const sections = r.sections ?? [];
  const outline = sections.find((s) => s.label === "개요");
  const board = sections.find((s) => s.label === "스토리보드");
  const evidenceBlock = outline ? blockOf(outline.markdown, /근거\s*정보/) : "";
  // 단계별 번호는 그 단계 안에서 1부터 다시 매겨진다 — 그 단계의 sources 배열로 호스트를 찾는다.
  const evidenceNs = marks(evidenceBlock);
  const evidenceHosts = new Set(
    evidenceNs.map((n) => outline?.sources.find((s) => s.n === n)?.url).filter((u): u is string => !!u).map(hostOf)
  );
  const boardMarks = board ? (board.markdown.match(/\[\d+\]/g) ?? []).length : 0;
  const outlineNums = numsOf(outline?.markdown ?? "");
  const drift = board ? [...numsOf(board.markdown)].filter((n) => !outlineNums.has(n)) : [];
  const repeats = findRepeatedStatements(sections.map((s) => ({ label: s.label, content: s.markdown }))).length;
  const topUp = rec.logs.some((l) => l.includes("근거 보강 조사 시작"));
  const order = rec.logs.find((l) => l.includes("단계 순서:"))?.replace(/.*단계 순서: /, "") ?? "동시";
  const warnings = sections
    .map((s) => [s.noSourcesWarning ? `${s.label}:출처경고` : "", s.structureWarning ? `${s.label}:항목경고` : "", s.lengthWarning ? `${s.label}:분량경고` : ""].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" ");
  rows.push(
    `| ${rec.id} | ${(r.latency_ms / 1000).toFixed(1)}초 | $${rec.usage.estimatedCostUsd.toFixed(4)} | ${order} | ${evidenceNs.length}/${evidenceHosts.size}곳 | ${boardMarks}개 | ${drift.length}개${drift.length ? ` ${JSON.stringify(drift.slice(0, 3))}` : ""} | ${repeats}쌍 | ${board ? countScenes(board.markdown) : "-"} | ${topUp ? "보강 O " : ""}${warnings || "없음"} |`
  );
  dump.push(
    `\n===== ${rec.id} =====\n[근거 정보 항목]\n${evidenceBlock || "(항목을 찾지 못함)"}\n\n[개요 출처]\n${(outline?.sources ?? []).map((s) => `  [${s.n}] ${hostOf(s.url)} — ${s.title}`).join("\n")}\n\n[스토리보드 앞부분]\n${(board?.markdown ?? "").slice(0, 700)}`
  );
}

const header = [
  `# 측정 (${tag})`,
  "",
  "| 실행 | 생성시간 | 비용 | 단계 순서 | 근거 각주/출처 | 스토리보드 각주 | 개요에 없는 수치 | 반복 | 장면 | 경고 |",
  "|---|---|---|---|---|---|---|---|---|---|",
];
const md = [...header, ...rows].join("\n");
fs.writeFileSync(path.join(OUT, `report-${tag}.md`), md + "\n\n" + dump.join("\n"), "utf8");
console.log(md);
