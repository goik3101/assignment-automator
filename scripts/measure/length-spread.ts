// 같은 안내문을 여러 번 돌렸을 때 **단계마다 분량이 얼마나 갈리는지**를 비용 0으로 본다.
//
// 왜(2026-11-10): "분량이 적당한가"를 점수로 잴 수 없다는 것은 이미 확인했다(같은 안내문 6표본이
// 660자→6/9, 1,750자→9/9로 점수가 분량을 따라가지 않는다). 그래서 **목표 대비 배수와 그 편차**로 본다.
// 역사 신문 "머리기사"는 목표 600자인데 저장된 9회가 214~930자였다 — 4회가 역할 바닥(300자)에도 못 미쳤다.
// 빈 칸은 그 칸 점수를 그대로 잃으므로, **바닥을 못 채우는 쪽이 넘치는 쪽보다 나쁘다.**
//
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/length-spread.ts [사례id조각]
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));

const { isDrawingBox } = await import("@/lib/essay/box-lines");

const DIR = path.join(REPO, "scratchpad", "measure", "out");
const only = process.argv.slice(2);

/** 소제목·표 줄을 뺀 본문 글자 수(공백 제외) — 칸에 실제로 들어갈 글의 양. */
function sectionLengths(file: string): { label: string; chars: number }[] {
  const raw = fs.readFileSync(file, "utf8").split("\n## 출처")[0];
  const heads = [...raw.matchAll(/^## (.+)$/gm)];
  return heads.map((h, i) => {
    const from = h.index! + h[0].length;
    const to = i + 1 < heads.length ? heads[i + 1].index! : raw.length;
    const body = raw
      .slice(from, to)
      .split("\n")
      .filter((l) => !/^\s*(?:#|\|)/.test(l))
      .join("")
      .replace(/\s/g, "");
    return { label: h[1].trim(), chars: body.length };
  });
}

// fc-<사례id><태그>.md — 사례 id는 저장된 사례 이름과 같다(final-check.ts의 CASES).
const runs = new Map<string, { tag: string; steps: { label: string; chars: number }[] }[]>();
for (const f of fs.readdirSync(DIR).filter((x) => x.startsWith("fc-") && x.endsWith(".md"))) {
  const m = /^fc-(.+?)(_[A-Za-z0-9-]+)?\.md$/.exec(f);
  if (!m) continue;
  const id = m[1];
  if (only.length && !only.some((o) => id.includes(o))) continue;
  const list = runs.get(id) ?? [];
  list.push({ tag: m[2]?.slice(1) ?? "-", steps: sectionLengths(path.join(DIR, f)) });
  runs.set(id, list);
}

for (const [id, list] of [...runs].sort()) {
  if (list.length < 2) continue;
  const labels = [...new Set(list.flatMap((r) => r.steps.map((s) => s.label)))].filter(
    (l) => l !== "제작 참고" && l !== "출처"
  );
  console.log(`\n### ${id}  (실행 ${list.length}회)`);
  for (const label of labels) {
    const vals = list.map((r) => r.steps.find((s) => s.label === label)?.chars).filter((v): v is number => v !== undefined);
    if (vals.length < 2) continue;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const mean = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const empty = vals.filter((v) => v < 60).length;
    const note = [
      isDrawingBox(label) ? "그림 칸(목표 없음)" : "",
      empty > 0 ? `**빈 칸 ${empty}/${vals.length}회**` : "",
      !isDrawingBox(label) && max > 0 && max / Math.max(min, 1) >= 3 ? `**${(max / Math.max(min, 1)).toFixed(1)}배 갈림**` : "",
    ]
      .filter(Boolean)
      .join(" ");
    console.log(
      `  ${label.padEnd(22)} 평균 ${String(mean).padStart(5)}자  범위 ${String(min).padStart(4)}~${String(max).padStart(4)}  ${note}`
    );
  }
}
console.log(`\n분량은 점수로 재지 말 것 — 빈 칸(60자 미만)과 실행 사이 갈림이 학생에게 실제로 해로운 것이다.`);
