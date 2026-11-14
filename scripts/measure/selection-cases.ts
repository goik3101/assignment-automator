// 저장된 분석(an-giant-*.json) 중 학생 지침 없이 **자동 대상 선정**이 걸리는 과제를 찾는다(겹침방지 점검 대상 고르기). 비용 0.
import fs from "node:fs";
import path from "node:path";
process.loadEnvFile(path.join(process.cwd(), ".env.local"));
const { needsSubjectSelection } = await import("@/lib/selection/selection-need");
const { CASES } = await import("./giant-cases.ts");
const dir = path.join(process.cwd(), "scratchpad", "measure", "out");
for (const c of CASES) {
  const f = path.join(dir, `an-giant-${c.id}.json`);
  if (!fs.existsSync(f)) continue;
  const a = JSON.parse(fs.readFileSync(f, "utf8"));
  const need = needsSubjectSelection(a.core_task_info);
  console.log(`${c.id}\t선정필요=${need}\t지침=${c.instructions ? "있음" : "없음"}\t${c.name}`);
}
