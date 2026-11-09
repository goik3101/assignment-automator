// 단계마다 **분량과 채점 점수**를 나란히 늘어놓는다(모델 호출 0). 역할 표를 추측으로 고치지 않기 위한 근거.
//
// 왜: "점수는 분량을 따라가지 않는다"는 것이 이미 확인됐지만(같은 안내문 6표본이 660→6/9, 1,750→9/9),
// 그것은 **한 단계 안에서** 그렇다는 뜻이고, 단계마다 목표가 맞는지는 따로 봐야 한다.
// 목표가 만점 실행의 분량과 크게 어긋난 단계만 고친다 — 어긋나지 않은 단계는 건드리지 않는다.
//
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/length-vs-score.ts
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));

const { effectiveTarget } = await import("@/lib/essay/length-plan");
const { submittedLength } = await import("@/lib/essay/submitted-length");

const OUT = path.join(REPO, "scratchpad", "measure", "out");
const scores = JSON.parse(fs.readFileSync(path.join(REPO, "scratchpad", "measure", "scores.json"), "utf8")) as Record<
  string,
  { got: number; total: number; key: string }
>;

function sections(md: string): { label: string; chars: number }[] {
  const body = md.split("\n## 출처")[0];
  const heads = [...body.matchAll(/^## (.+)$/gm)];
  return heads
    .map((h, i) => {
      const from = h.index! + h[0].length;
      const to = i + 1 < heads.length ? heads[i + 1].index! : body.length;
      return {
        label: h[1].trim(),
        // 시스템이 칸 상한을 재는 것과 **같은 자**로 센다 — 다른 자로 재면 목표와 실측을 나란히 놓을 수 없다.
        chars: submittedLength(body.slice(from, to)),
      };
    })
    .filter((s) => s.label !== "제작 참고");
}

// 사례 id → 단계 → [분량, 비율]
const rows = new Map<string, Map<string, { chars: number; ratio: number; score: string }[]>>();
for (const [file, sc] of Object.entries(scores)) {
  const at = path.join(OUT, file);
  if (!fs.existsSync(at)) continue;
  const id = /^fc-(.+?)(_[A-Za-z0-9-]+)?\.md$/.exec(file)?.[1] ?? file;
  if (!rows.has(id)) rows.set(id, new Map());
  for (const s of sections(fs.readFileSync(at, "utf8"))) {
    const list = rows.get(id)!.get(s.label) ?? [];
    list.push({ chars: s.chars, ratio: sc.got / sc.total, score: `${sc.got}/${sc.total}` });
    rows.get(id)!.set(s.label, list);
  }
}

for (const [id, byLabel] of [...rows].sort()) {
  console.log(`\n### ${id}`);
  for (const [label, list] of byLabel) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.chars - b.chars);
    const full = list.filter((x) => x.ratio === 1).map((x) => x.chars);
    const mid = (ns: number[]) => (ns.length ? [...ns].sort((a, b) => a - b)[Math.floor(ns.length / 2)] : null);
    console.log(
      `  ${label.slice(0, 22).padEnd(24)} ${sorted.map((x) => `${x.chars}(${x.score})`).join(" ")}` +
        (full.length ? `\n  ${" ".repeat(24)} → 만점 ${full.length}회 중앙 ${mid(full)}자 (범위 ${Math.min(...full)}~${Math.max(...full)})` : "")
    );
  }
}
console.log(`\n채점 ${Object.keys(scores).length}편. 만점 표본이 3회 미만인 단계는 근거로 쓰지 말 것.`);
