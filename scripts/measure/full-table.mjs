// 전체 점검 결과(full/w*.json) 병합 표 + 이전 라운드(giant-results-round2-final.json)와 비교. 사용: node scripts/measure/full-table.mjs [폴더]
import fs from "node:fs";
const dir = process.argv[2] ?? "scratchpad/measure/full";
const all = {};
for (const f of fs.readdirSync(dir).filter((f) => /^w\d+\.json$/.test(f))) Object.assign(all, JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8")));
fs.writeFileSync(`${dir}/merged.json`, JSON.stringify(all, null, 2));
let prev = {};
try {
  prev = JSON.parse(fs.readFileSync("scratchpad/measure/giant-results-round2-final.json", "utf8"));
} catch {}
const ids = Object.keys(all).sort();
let got = 0, tot = 0, pg = 0, pt = 0;
const gens = [], totals = [];
console.log("| 과제 | 채점(이전) | 생성초 | 조사초 | 합계초 | 분량 | 출처 | 비용 | 결함(날조/빈칸/금지/무각주/반복) |\n|---|---|---|---|---|---|---|---|---|");
for (const id of ids) {
  const x = all[id], p = prev[id];
  got += x.got; tot += x.total;
  if (p) { pg += p.got; pt += p.total; }
  gens.push(x.genSec); totals.push(x.genSec + (x.researchSec ?? 0));
  const d = x.defects ?? {};
  console.log(`| ${id} | ${x.score}${p ? ` (${p.score})` : ""} | ${x.genSec.toFixed(1)} | ${(x.researchSec ?? 0).toFixed(1)} | ${(x.genSec + (x.researchSec ?? 0)).toFixed(1)} | ${x.chars} | ${x.sources?.n}(${Object.entries(x.sources?.tiers ?? {}).map(([k, v]) => k + v).join(",")}) | $${x.costUsd.toFixed(3)} | ${d.own}/${d.blanks}/${d.banned}/${d.uncited}/${d.repeated} |`);
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
console.log(`\n채점 ${got}/${tot} (${((100 * got) / tot).toFixed(1)}%) | 이전 라운드 같은 과제 ${pg}/${pt} | 생성(조사 제외) 중앙 ${med(gens).toFixed(1)}초, 30초 이내 ${gens.filter((g) => g <= 30).length}/${gens.length} | 합계(조사 포함) 중앙 ${med(totals).toFixed(1)}초, 30초 이내 ${totals.filter((g) => g <= 30).length}/${totals.length} | 비용 합 $${Object.values(all).reduce((s, x) => s + x.costUsd, 0).toFixed(2)}`);
