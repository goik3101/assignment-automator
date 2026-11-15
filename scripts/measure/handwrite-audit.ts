// 비용 0: 저장된 안내문 분석 전부에 "교실에서 손으로 쓰는 평가" 관문을 돌려, 어느 과제에서 열리는지와 그 예산을 본다.
// 새 신호를 넣을 때 가정에서 하는 보고서가 잘못 열리지 않는지 확인하려는 것(전·후 비교는 OLD 정규식).
import fs from "node:fs";
import path from "node:path";
process.loadEnvFile(path.join(process.cwd(), ".env.local"));
const { handwriteBudget } = await import("@/lib/essay/handwrite-budget");
const OLD = /시험\s*대형|개별\s*평가|개별\s*작성|그\s*자리에서\s*작성|교실에서\s*작성|책상\s*간격|휴대폰\s*(?:사용\s*불가|걷)|부정\s*행위/;
const dir = path.join(process.cwd(), "scratchpad", "measure", "out");
let opened = 0, newly = 0, n = 0;
for (const f of fs.readdirSync(dir).filter((f) => /^an-.*\.json$/.test(f)).sort()) {
  const a = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const c = a.core_task_info ?? a;
  if (!c.task_elements) continue;
  n++;
  const text = [c.writing_guide, ...(c.requirements ?? []), ...c.task_elements.map((e: { description: string }) => e.description)];
  const b = handwriteBudget(text);
  const was = OLD.test(text.filter(Boolean).join("\n"));
  if (b) opened++;
  if (b && !was) newly++;
  if (b || was) console.log(`${f.replace(/^an-(giant-)?|\.json$/g, "")}\t이전 ${was ? "열림" : "닫힘"} → 지금 ${b ? `열림(${b.chars}자, ${b.basis})` : "닫힘"}`);
}
console.log(`\n분석 ${n}종 중 지금 열리는 것 ${opened}, 새로 열린 것 ${newly}`);
