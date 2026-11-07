// 분량 기준이 단계마다 어느 단에서 나오는지 전수로 본다(모델 호출 0).
// 단: ①안내문 명시(target_length) ②양식 칸 줄 수(box-lines) ③쪽·매(page-length) ④분석이 사진을 보고 정한 추정(length-estimate) ⑤유형 추론/역할 기본값(length-plan)
import fs from "node:fs";
import path from "node:path";
import type { CoreTaskInfo } from "@/types/task";
import { boxLengths } from "@/lib/essay/box-lines";
import { pageLengthForElement } from "@/lib/essay/page-length";
import { planLength, narrowTarget } from "@/lib/essay/length-plan";
import { isDrawingBox } from "@/lib/essay/box-lines";

const OUT = "scratchpad/measure/out";
const FILES = [
  ...fs.readdirSync(OUT).filter((f) => f.startsWith("an-") && f.endsWith(".json")).map((f) => path.join(OUT, f)),
  "scratchpad/measure/social-analysis.json",
  "scratchpad/measure/newspaper-analysis.json",
  "scratchpad/measure/korean1-analysis.json",
];

const tally: Record<string, number> = { 명시: 0, 칸줄수: 0, 쪽매: 0, 분석추정: 0, 추론: 0, 그림칸: 0 };
for (const f of FILES) {
  if (!fs.existsSync(f)) continue;
  const raw = JSON.parse(fs.readFileSync(f, "utf8"));
  const core: CoreTaskInfo = raw.core_task_info ?? raw.coreTaskInfo ?? raw;
  const els = (core.task_elements ?? []).filter((e: any) => e.type === "text_submission");
  if (els.length === 0) continue;
  const labels = els.map((e: any) => e.label);
  const boxes = boxLengths(labels, core.writing_guide);
  console.log(`\n### ${path.basename(f)}`);
  for (const el of els as any[]) {
    const box = boxes.find((b) => b.label === el.label);
    const pg = pageLengthForElement(el, core.requirements ?? [], core.writing_guide, labels);
    const p = planLength(el);
    const t = narrowTarget(el);
    let rung = "추론", detail = `${p.role} 예전 ${Math.round(p.min)}~${Math.round(p.max)}자(${(p.max / Math.max(1, p.min)).toFixed(1)}배) → 약 ${t.target}자(${t.min}~${t.max})`;
    if (isDrawingBox(el.label)) { rung = "그림칸"; detail = "분량 목표 없음(그림 칸)"; }
    else if (el.target_length) { rung = "명시"; detail = `${el.target_length.min}~${el.target_length.max}${el.target_length.unit ?? ""}`; }
    else if (box) { rung = "칸줄수"; detail = `${box.lines}줄→${box.min}~${box.max}자`; }
    else if (pg) { rung = "쪽매"; detail = `"${pg.text}"→${pg.min}~${pg.max}자`; }
    else if (el.length_estimate) { rung = "분석추정"; detail = `${el.length_estimate.chars}자(${el.length_estimate.basis}) → ${t.min}~${t.max}`; }
    tally[rung]++;
    console.log(`  ${rung.padEnd(4)} | ${String(el.label).slice(0, 22).padEnd(24)} | ${detail}`);
  }
}
console.log(`\n=== 단계 ${Object.values(tally).reduce((a, b) => a + b, 0)}개: ` + Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(" / ") + " ===");
