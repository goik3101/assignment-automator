// **분량 기준이 실제로 우선순위대로 적용되는지** 단계마다 눈으로 본다. 모델 호출 없음(비용 0).
//
// 왜: 분량 기준은 외부 문서(`수행평가 안내문/줄chatgpt기준.txt`)에서 가져온 우선순위를 따른다 —
//   1순위 안내문이 못 박은 분량  2순위 제출 양식 칸의 공간  3순위 과제 유형·복잡도
//   4순위 평가 기준 개수(※ 우리는 기각했다 — 8장면 스토리보드가 500자가 됐다)  5순위 일반 관행
// 여기에 우리가 더한 것이 **교실에서 손으로 쓸 시간**이다(2026-11-12, 그 문서가 "제출 형식: 시험지 작성"을
// 판단 요소로 적어 두고 숫자는 주지 않은 자리다).
//
// 지금까지 이 우선순위는 코드에 흩어져 있어서 "이 단계는 누가 분량을 정했나"를 아무도 볼 수 없었다.
// 2026-11-10에 그래서 사고가 났다(프롬프트와 판정이 서로 다른 숫자를 말했다). 이 스크립트는 그걸 표로 찍고,
// 채점된 만점 실측을 나란히 둬서 기준이 현실과 맞는지 바로 보이게 한다.
//
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/length-standard.ts
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();

const { planLength, effectiveTarget } = await import("@/lib/essay/length-plan");
const { boxLengths } = await import("@/lib/essay/box-lines");
const { handwriteBudget } = await import("@/lib/essay/handwrite-budget");

type El = { label: string; description: string; type?: string; required_items?: string[]; target_length?: { min: number; max: number } };

const dir = path.join(REPO, "scratchpad/measure");
const files = fs.readdirSync(dir).filter((f) => f.endsWith("-analysis.json"));

// 채점된 만점 실측(scores.json + out/*.md에서 length-truth가 쓰는 것과 같은 자료)
const scoresPath = path.join(dir, "scores.json");
const scores: Record<string, { score: number; max: number }> = fs.existsSync(scoresPath)
  ? JSON.parse(fs.readFileSync(scoresPath, "utf8"))
  : {};

console.log("단계마다 **누가 분량을 정했는가**. 위에 있는 기준이 이긴다.\n");
console.log("과제 / 단계\t1.안내문\t2.칸\t3.유형(역할)\t손글씨상한\t→ 최종\t근거");

for (const f of files) {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const core = raw.core_task_info ?? raw;
  const els: El[] = (core.task_elements ?? []).filter((e: El) => e.type === "text_submission");
  if (els.length === 0) continue;
  const labels = els.map((e) => e.label);
  const ctx = {
    topic: core.topic,
    siblings: els.map((e) => ({ label: e.label, description: e.description })),
    requirements: core.requirements ?? [],
    guide: core.writing_guide,
    labels,
  };
  const boxes = boxLengths(labels, core.writing_guide, [...(core.requirements ?? []), core.writing_guide ?? ""]);
  const budget = handwriteBudget([core.writing_guide, ...(core.requirements ?? []), ...els.map((e) => e.description)]);

  console.log(`\n### ${f.replace(/-analysis\.json$/, "").replace(/^N-/, "")}${budget ? `  (교실 작성: ${budget.basis} → ${budget.chars}자)` : ""}`);
  for (const el of els) {
    const stated = el.target_length ? `${el.target_length.min}~${el.target_length.max}` : "-";
    const box = boxes.find((b: { label: string }) => b.label === el.label);
    const boxTxt = box ? `${(box as { min?: number }).min ?? "?"}~${(box as { max?: number }).max ?? "?"}` : "-";
    const plan = planLength(el as never, ctx as never);
    const final = effectiveTarget(el as never, ctx as never);
    console.log(
      `  ${el.label}\t${stated}\t${boxTxt}\t${plan.role} ${plan.min}~${plan.max}\t${budget ? budget.chars : "-"}\t→ ${final ?? "(범위)"}\t${plan.basis}`
    );
  }
}

const graded = Object.entries(scores).filter(([, v]) => v && v.score === v.max).length;
console.log(`\n(채점 기록 ${Object.keys(scores).length}건 중 만점 ${graded}건 — 단계별 실제 글자 수는 length-truth.ts로 본다)`);
