// **분량 기준이 몇 개이고 서로 싸우는지**를 저장된 분석 결과 전수로 본다(모델 호출 없음, 비용 0).
//
// 왜(2026-11-10): 분량이 실행마다 갈리는 것을 "모델이 숫자를 안 지킨다"로만 보고 있었다. 그런데 코드에는
// 분량을 정하는 곳이 **다섯 군데**다 — 역할 표(length-plan), 안내문의 쪽·매(page-length), 안내문의
// 문장·줄 상한(form-requirements의 hasSizeLimit), 분석이 사진 보고 정한 값(length-estimate, 기본 꺼짐),
// 그리고 **생성 뒤 판정에만 쓰는 칸 줄 수**(box-lines).
//
// 가장 위험한 것은 마지막이다: **프롬프트에 주는 숫자와 생성 뒤 판정하는 숫자가 다른 모듈에서 나온다.**
// 프롬프트가 "약 600자"라고 말하고 판정이 "8줄=240자까지"라고 하면, 모델이 지시를 지켜도 넘침으로 잡혀
// 그 단계를 다시 쓰게 된다(반대로 판정이 꺼지면 아무것도 상한을 말하지 않는다).
//
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/length-sources-audit.ts
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));

const { effectiveTarget, lengthRoleOf } = await import("@/lib/essay/length-plan");
const { boxLengths, noLengthLimit, isDrawingBox } = await import("@/lib/essay/box-lines");
const { pageLengthForElement, requirementsForElement, hasSizeLimit } = await import("./length-sources-deps.ts");

const DIR = path.join(REPO, "scratchpad", "measure");
const files = fs.readdirSync(DIR).filter((f) => f.endsWith("-analysis.json"));

let conflicts = 0;
let silent = 0;
let rows = 0;

for (const f of files.sort()) {
  const a = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  const core = a.core_task_info ?? a;
  const elements: { label: string; description: string; required_items?: string[] }[] = core.task_elements ?? [];
  if (elements.length === 0) continue;
  const labels = elements.map((e) => e.label);
  const ctx = {
    requirements: core.requirements ?? [],
    guide: core.writing_guide,
    labels,
    topic: core.topic,
    siblings: elements.map((e) => ({ label: e.label, description: e.description })),
  };
  const boxes = boxLengths(labels, core.writing_guide, [core.writing_guide, ...(core.requirements ?? [])]);
  const noLimit = noLengthLimit([core.writing_guide, ...(core.requirements ?? [])]);
  console.log(`\n### ${f}  (단계 ${elements.length}개)${noLimit ? "  — 안내문: 분량 제한 없음" : ""}`);
  for (const el of elements) {
    rows++;
    const prompt = effectiveTarget(el as never, ctx as never);
    const box = boxes.find((b) => b.label === el.label);
    const reqs = requirementsForElement(el as never, ctx.requirements, ctx.guide, labels);
    const capped = hasSizeLimit(reqs);
    const pg = pageLengthForElement(el as never, ctx.requirements, ctx.guide, labels);
    const role = lengthRoleOf(el as never, { topic: ctx.topic, siblings: ctx.siblings } as never);
    const said = prompt === null ? "없음" : `약 ${prompt}자`;
    const judged = box ? `${box.min}~${box.max}자(칸 ${box.lines}줄)` : "없음";
    // 싸우는 경우: 프롬프트가 말한 목표가 판정 상한을 이미 넘는다.
    const fight = prompt !== null && box && prompt > box.max;
    // 아무도 말하지 않는 경우: 프롬프트도 판정도 상한이 없다(그림 칸은 정상).
    const quiet = prompt === null && !box && !capped && !isDrawingBox(el.label);
    if (fight) conflicts++;
    if (quiet) silent++;
    console.log(
      `  ${el.label.slice(0, 20).padEnd(22)} 역할=${String(role).padEnd(15)} 프롬프트=${said.padEnd(10)} 생성뒤판정=${judged.padEnd(22)}` +
        `${pg ? ` 쪽·매=${pg.min}~${pg.max}` : ""}${capped ? " 개수상한있음" : ""}` +
        `${fight ? "  ◀◀ 싸움(프롬프트가 판정 상한보다 큼)" : ""}${quiet ? "  ◀◀ 아무도 상한을 말하지 않음" : ""}`
    );
  }
}

console.log(`\n=== 단계 ${rows}개 중 — 프롬프트↔판정 싸움 ${conflicts}개 / 상한 침묵 ${silent}개 ===`);
console.log(`싸움은 "모델이 지시를 지켜도 넘침으로 잡힌다"는 뜻이고, 침묵은 "길이를 막는 것이 아무것도 없다"는 뜻이다.`);
