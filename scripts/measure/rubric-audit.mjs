// 저장된 분석 결과마다 체크리스트에 무엇이 들어가는지 전부 출력(모델 호출 없음, 비용 0).
import fs from "node:fs";
import path from "node:path";
const { buildRubric } = await import("@/lib/essay/rubric-check");
const { scopeStatements, splitStatements } = await import("@/lib/essay/requirement-scope");
const dir = path.join(process.cwd(), "scratchpad/measure");
const files = fs.readdirSync(dir).filter((f) => f.endsWith("-analysis.json"));
const extra = fs.existsSync(path.join(dir, "analyses")) ? fs.readdirSync(path.join(dir, "analyses")).map((f) => path.join("analyses", f)) : [];
for (const f of [...files, ...extra]) {
  const a = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const core = a.core_task_info ?? a;
  const labels = (core.task_elements ?? []).filter((e) => e.type === "text_submission").map((e) => e.label);
  const scoped = scopeStatements(splitStatements([...(core.requirements ?? []), core.writing_guide ?? ""]), core.task_elements ?? [], labels);
  console.log(`\n### ${f}  (단계: ${labels.join(", ")})`);
  for (const it of buildRubric(scoped)) console.log(`  [${it.label ?? "전체"}] ${it.text}`);
  if (scoped.withheld.length) console.log(`  (제외됨/withheld: ${scoped.withheld.length}개)`);
}
