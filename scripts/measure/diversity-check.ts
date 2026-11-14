// 겹침방지 점검 — **DB에 아무것도 쓰지 않는다.** 서버 경로(identifyCluster·saveResultEmbedding·recordRecommendation)를 타지 않고
// 같은 안내문으로 학생 N명이 차례로 쓰는 것을 메모리 이력만으로 흉내 낸다(CLAUDE.md 2026-11-02: 측정은 실제 학생의 다양성에 영향이 없다).
//   1) 자동 선정(selection.history): 앞 학생이 고른 대상이 다음 학생에게 이력으로 들어가 다른 대상이 나오는가
//   2) 결과물 의미 겹침(embedForDiversity 코사인): 학생끼리 결과물이 얼마나 닮았는가 — AVOID=strong이면 회피 지시를 넣어 비교
//   3) 클러스터 식별은 읽기 전용(match_cluster RPC만 호출, centroid·로그를 갱신하지 않음) — 같은 안내문 변형이 같은 클러스터로 모이는가
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/diversity-check.ts <id> <학생수> [strong]
import fs from "node:fs";
import path from "node:path";

const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));
process.env.SOURCE_STATS_LOG = "off";

const { generateEssay } = await import("@/lib/gemini/generate-essay");
const { embedForDiversity } = await import("@/lib/gemini/embeddings");
const { canonicalize } = await import("@/lib/selection/canonical");

const [id, nArg, mode] = process.argv.slice(2);
const N = Number(nArg ?? 4);
const OUT = path.join(REPO, "scratchpad", "measure", "out");
const DIV = path.join(REPO, "scratchpad", "measure", "diversity");
fs.mkdirSync(DIV, { recursive: true });

const an = JSON.parse(fs.readFileSync(path.join(OUT, `an-giant-${id}.json`), "utf8"));
const { CASES } = await import("./giant-cases.ts");
const c = CASES.find((x) => x.id === id);
const scopeKey = `TEST-DIVERSITY-${id}`; // 실제 클러스터 id가 아니므로 어떤 실제 이력과도 섞이지 않는다.
const AVOID_STRONG =
  "이 과제에는 이미 비슷한 소재·관점의 답변이 많이 몰려 있다. 뻔하거나 가장 먼저 떠오르는 접근은 피하고, 눈에 띄게 다른 소재·관점·구성으로 작성할 것.";

const cos = (a: number[], b: number[]) => {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
  return d / Math.sqrt(x * y);
};

const history: { key: string; name?: string; group?: string | null; scopeKey: string; createdAt: string; userId?: string }[] = [];
const texts: string[] = [];
const chosen: string[] = [];
for (let s = 0; s < N; s++) {
  const t0 = Date.now();
  const r = await generateEssay({
    subject: an.subject,
    coreTaskInfo: an.core_task_info,
    instructions: process.env.NOINSTR === "1" ? undefined : c?.instructions,
    avoidanceInstruction: mode === "strong" ? AVOID_STRONG : undefined,
    selection: { userId: `test-student-${s}`, scopeKey, history: [...history] },
  });
  if (r.type !== "essay") { console.log(`  학생${s + 1}: 생성 실패(${r.type})`); continue; }
  const auto = r.selection && !r.selection.violated ? r.selection : null;
  const canon = auto ? { key: auto.key, display: auto.name } : canonicalize(r.confirmedSubject ?? r.recommendedBookTitle ?? "");
  history.push({ key: canon.key, name: canon.display, group: auto?.group ?? null, scopeKey, createdAt: new Date().toISOString(), userId: `test-student-${s}` });
  chosen.push(canon.display || "(대상 없음)");
  texts.push(r.markdown);
  console.log(`  학생${s + 1}: 대상="${canon.display}"${auto ? " (자동 선정)" : ""} ${((Date.now() - t0) / 1000).toFixed(1)}초 ${r.markdown.length}자`);
}
const vecs = await Promise.all(texts.map((t) => embedForDiversity(t)));
const sims: number[] = [];
const rows: string[] = [];
for (let i = 0; i < vecs.length; i++) for (let j = i + 1; j < vecs.length; j++) { const v = cos(vecs[i], vecs[j]); sims.push(v); rows.push(`${i + 1}-${j + 1}: ${v.toFixed(3)}`); }
const mean = sims.length ? sims.reduce((a, b) => a + b, 0) / sims.length : 0;
console.log(`\n${id} ${mode === "strong" ? "[회피 지시 강]" : "[회피 지시 없음]"} 학생 ${texts.length}명 | 선택된 대상: ${chosen.join(" / ")}`);
console.log(`결과물 의미 유사도(코사인) 평균 ${mean.toFixed(3)} 최대 ${sims.length ? Math.max(...sims).toFixed(3) : "-"} | ${rows.join(", ")} (기준: 쏠림으로 치는 문턱 0.85)`);
fs.writeFileSync(path.join(DIV, `${id}-${mode ?? "none"}.json`), JSON.stringify({ id, mode: mode ?? "none", chosen, mean, sims, texts }, null, 2), "utf8");
