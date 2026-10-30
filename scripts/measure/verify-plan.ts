// 저장된 생성 결과에 계획 문장 각주 제거를 그대로 돌려 본다(모델 호출 없음 — 비용 0).
// 사용: node --import ./scripts/measure/loader/register.mjs scratchpad/measure/verify-plan.ts
import fs from "node:fs";
import path from "node:path";
import { stripPlanCitations } from "@/lib/essay/plan-citations";
import { hasVerifiableClaimText } from "@/lib/essay/verifiable-claims";
import type { EssayResult } from "@/types/task";

const OUT = path.join(process.cwd(), "scratchpad", "measure", "out");
const files = fs.readdirSync(OUT).filter((f) => /^ab[12]-/.test(f) && f.endsWith(".json")).sort();

const count = (t: string) => (t.match(/\[\d+\]/g) ?? []).length;
let before = 0;
let after = 0;
let stripped = 0;
const emptied: string[] = [];
const lines: string[] = [];

for (const f of files) {
  const rec = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")) as { id: string; result: EssayResult | { type: "insufficient_data" } };
  if (rec.result.type !== "essay") continue;
  for (const s of rec.result.sections ?? []) {
    const r = stripPlanCitations(s.markdown);
    before += count(s.markdown);
    after += count(r.content);
    stripped += r.stripped;
    if (r.stripped > 0) {
      // 어떤 문장에서 떼었는지 — 전수 확인용
      const b = s.markdown.split("\n");
      r.content.split("\n").forEach((line, i) => {
        if (line !== b[i]) lines.push(`  ${rec.id} | ${s.label} | ${line.replace(/^\s*[-*•]\s*/, "").trim().slice(0, 100)}`);
      });
      if (count(r.content) === 0 && count(s.markdown) > 0) {
        emptied.push(`${rec.id} | ${s.label} | 각주 ${count(s.markdown)} → 0 | 검증 필요한 주장 ${hasVerifiableClaimText(r.content) ? "있음(경고 뜸)" : "없음"}`);
      }
    }
  }
}

console.log(`대상 ${files.length}개 결과 | 각주 ${before} → ${after} (뗀 각주 ${stripped}개, ${((100 * stripped) / before).toFixed(1)}%)`);
console.log(`\n각주가 0개가 되는 단계: ${emptied.length ? "\n" + emptied.join("\n") : "없음"}`);
console.log(`\n--- 각주를 뗀 문장 전수 (${lines.length}줄) ---\n${lines.join("\n")}`);
