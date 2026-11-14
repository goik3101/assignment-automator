// giant-results.json → 마크다운 표(docs 보고서에 붙이는 용도). 모델 호출 없음.
import fs from "node:fs";
const r = JSON.parse(fs.readFileSync("scratchpad/measure/giant-results.json", "utf8"));
let t = "| 과제 | 이름 | 분석초 | 생성초 | 비용 | 분량(자) | 출처(개·등급) | 정답 채점 | 남은 결함 |\n|---|---|---|---|---|---|---|---|---|\n";
for (const id of Object.keys(r).sort()) {
  const v = r[id];
  const d = v.defects;
  const tiers = Object.entries(v.sources.tiers).map(([k, n]) => k + n).join(" ") || "-";
  const df = [d.own && "날조" + d.own, d.uncited && "무각주" + d.uncited, d.repeated && "반복" + d.repeated, d.banned && "금지" + d.banned].filter(Boolean).join(" ") || "-";
  t += `| ${id} | ${v.name} | ${v.analyzeSec.toFixed(0)} | ${v.genSec.toFixed(1)}${v.genSec > 30 ? " ⚠" : ""} | $${v.costUsd.toFixed(3)} | ${v.chars} | ${v.sources.n} (${tiers}) | ${v.score} | ${df} |\n`;
}
fs.writeFileSync("scratchpad/measure/giant-table.md", t);
console.log(t);
