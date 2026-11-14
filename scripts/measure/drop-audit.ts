// 저장된 분석 결과 전부에 "선택 활동·옮겨 입력 단계 빼기" 규칙을 돌려, 어떤 단계가 빠지는지 전수로 본다(모델 호출 없음, 비용 0).
// 거짓 양성(멀쩡한 단계가 빠짐)을 찾는 용도 — 새 규칙을 고치면 먼저 이것을 돌릴 것.
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/drop-audit.ts
import fs from "node:fs";
import path from "node:path";
import { dropNonSubmissionActivities, isOptionalActivity, isTranscriptionStep } from "@/lib/gemini/analysis-normalize";

const dirs = [path.join(process.cwd(), "scratchpad", "measure", "out"), path.join(process.cwd(), "scratchpad", "measure")];
const files = dirs.flatMap((d) => fs.readdirSync(d).filter((f) => /^(an-.*|N-.*-analysis|.*analysis)\.json$/.test(f)).map((f) => path.join(d, f)));
let n = 0;
let dropped = 0;
for (const f of [...new Set(files)]) {
  let core: any;
  try {
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    core = j.core_task_info ?? j;
  } catch {
    continue;
  }
  if (!core?.task_elements) continue;
  n++;
  const ctx = [...(core.requirements ?? []), core.writing_guide ?? ""];
  const { dropped: d } = dropNonSubmissionActivities(core.task_elements, ctx);
  const byNew = d.filter((e: any) => isOptionalActivity(e, ctx) || isTranscriptionStep(e));
  for (const e of byNew) {
    dropped++;
    console.log(`${path.basename(f)} | 뺌: ${e.label} | ${String(e.description).slice(0, 80)} | ${isOptionalActivity(e, ctx) ? "선택활동" : "옮겨입력"}`);
  }
}
console.log(`\n안내문 ${n}종 중 새 규칙으로 빠진 단계 ${dropped}개`);
