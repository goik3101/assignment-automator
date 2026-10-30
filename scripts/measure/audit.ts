// 저장된 안내문 분석 결과마다, 코드의 "안내문 읽기 규칙"이 무엇으로 판정하는지 전부 찍는다. 모델 호출 없음.
import fs from "node:fs";
import path from "node:path";
const { needsSubjectSelection } = await import("@/lib/learning/items");
const { planEvidence } = await import("@/lib/essay/evidence-slots");
const { visualPolicy, needsDataTable } = await import("@/lib/essay/data-visual");
const { requirementsForElement, describeReq } = await import("@/lib/essay/form-requirements");
const { promptRuleScope } = await import("@/lib/essay/prompt-scope");
const { lengthRoleOf, planLength } = await import("@/lib/essay/length-plan");
const { needsExcerpt } = await import("@/lib/essay/excerpt-need");
const { isOwnRecordStep } = await import("@/lib/essay/own-activity");
const { inferFormKinds } = await import("@/lib/essay/form-rules");

const OUT = "scratchpad/measure/out";
const files = [
  ...fs.readdirSync(OUT).filter((f) => f.startsWith("an-") && f.endsWith(".json")).map((f) => path.join(OUT, f)),
  "scratchpad/measure/social-analysis.json",
].filter((p) => fs.existsSync(p));

for (const p of files) {
  const a = JSON.parse(fs.readFileSync(p, "utf8"));
  const core = a.core_task_info;
  const els = core.task_elements ?? [];
  const text = els.filter((e: any) => e.type === "text_submission");
  const labels = els.map((e: any) => e.label);
  const texts = [core.topic, ...core.requirements, core.writing_guide ?? "", ...els.map((e: any) => e.description)];
  console.log(`\n### ${path.basename(p).replace(/\.json$/, "")}  [${a.subject}]`);
  console.log(`  자동 대상 선정 : ${needsSubjectSelection(core) ? "켬" : "끔"}`);
  const ev = planEvidence({ topic: core.topic, requirements: core.requirements, writing_guide: core.writing_guide, task_elements: els });
  console.log(`  근거 슬롯      : ${ev.slots}개 입장=${ev.stance ?? "-"} 단계=${ev.label ?? "-"}`);
  const pol = visualPolicy(texts);
  console.log(`  자료 제한      : 허용[${pol.allowed}] 금지[${pol.banned}]`);
  console.log(`  원문 구절 요구 : ${needsExcerpt(texts)}`);
  const scope = promptRuleScope({ subject: a.subject, texts, hasPresetSubject: false });
  console.log(`  들어가는 규칙  : ${JSON.stringify(scope)}`);
  for (const e of els) {
    const t = e.type === "text_submission";
    const reqs = t ? requirementsForElement(e, core.requirements, core.writing_guide, labels) : [];
    console.log(
      `   - ${e.label} [${e.type}]` +
        (t
          ? ` 역할=${lengthRoleOf(e)} 분량=${JSON.stringify(planLength(e))} 표요구=${needsDataTable(e, core.requirements, core.writing_guide, text.length === 1)}` +
            ` 개수=${reqs.map(describeReq).join("+") || "-"} 직접기록=${isOwnRecordStep(e)} 글종류=${inferFormKinds(e).join(",") || "-"}`
          : "")
    );
  }
}
