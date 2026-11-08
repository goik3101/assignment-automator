// 세 축(분량 기준·출처 품질·시간)을 저장된 자료만으로 전수 점검한다. **모델 호출 0.**
//
// 왜: 생성 1회가 $0.05·30~50초라 "하나 고치고 한 번 돌려 보기"로는 전수를 볼 수 없다. 이미 쌓인
// 분석 12건·결과물 31편·로그 31건에서 먼저 어디가 어긋났는지 숫자로 잡고, 생성은 고친 뒤 확인에만 쓴다.
//
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/three-axis-audit.ts
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
const OUT = path.join(REPO, "scratchpad/measure/out");

const { lengthRoleOf, planLength, narrowTarget } = await import("@/lib/essay/length-plan");
const { classifySourceTier } = await import("@/lib/links/source-quality");
// 감사가 규칙을 베껴 쓰면 코드와 어긋난다 — 실제로 도는 판정을 그대로 불러 쓴다.
const { isLandingPage, isSecondChoicePage } = await import("@/lib/essay/research-notes");

/* ───────── 1. 단계 역할 분류 vs 채점된 결과물의 실제 분량 ───────── */
// 정답 채점이 있는 결과물의 단계별 글자 수(scripts/measure/length-truth.ts의 표). 사람이 옮겨 적은 값.
const SCORED_LEN: Record<string, { chars: number; score: string }> = {
  "산·염기 실험": { chars: 1285, score: "11/11" },
  "탐구 보고서": { chars: 1358, score: "11/11" },
  "민주화 운동 카드뉴스": { chars: 1750, score: "9/9" },
  개요: { chars: 1356, score: "11/12" },
  스토리보드: { chars: 915, score: "11/12" },
  머리기사: { chars: 930, score: "11/11" },
  인터뷰: { chars: 687, score: "11/11" },
  "사설/칼럼": { chars: 362, score: "11/11" },
  "신문 기사 스크랩": { chars: 202, score: "-" },
  "경제 문제 분석 및 소견 평가지": { chars: 1338, score: "-" },
};

const analyses = [
  ...fs.readdirSync(OUT).filter((f) => f.startsWith("an-") && f.endsWith(".json")).map((f) => path.join(OUT, f)),
  path.join(REPO, "scratchpad/measure/social-analysis.json"),
  path.join(REPO, "scratchpad/measure/newspaper-analysis.json"),
  path.join(REPO, "scratchpad/measure/korean1-analysis.json"),
];

console.log("## 1. 단계 역할 분류 — 목표가 채점된 실제 분량과 얼마나 다른가\n");
console.log("배수가 1에 가까우면 맞는 목표다. 0.5 미만·2 초과면 역할 분류를 의심한다.\n");
const seen = new Set<string>();
const offenders: { label: string; role: string; target: number; real: number; ratio: number }[] = [];
for (const f of analyses) {
  if (!fs.existsSync(f)) continue;
  const raw = JSON.parse(fs.readFileSync(f, "utf8"));
  const core = raw.core_task_info ?? raw;
  for (const el of (core.task_elements ?? []) as { type: string; label: string }[]) {
    if (el.type !== "text_submission") continue;
    const real = SCORED_LEN[el.label];
    if (!real || seen.has(el.label)) continue;
    seen.add(el.label);
    const sibs = (core.task_elements ?? []).map((x: any) => ({ label: x.label, description: x.description }));
    const ctx = { topic: core.topic, siblings: sibs };
    const role = lengthRoleOf(el as never, ctx);
    const p = planLength(el as never, ctx);
    const t = narrowTarget(el as never, ctx);
    const ratio = t.target / real.chars;
    offenders.push({ label: el.label, role, target: t.target, real: real.chars, ratio });
    const flag = ratio < 0.5 || ratio > 2 ? "  ← **어긋남**" : "";
    console.log(
      `  ${el.label.slice(0, 20).padEnd(22)} 역할=${role.padEnd(16)} 목표 ${String(t.target).padStart(5)}자  실제 ${String(real.chars).padStart(5)}자(${real.score})  ${ratio.toFixed(2)}배 [범위 ${p.min}~${p.max}]${flag}`
    );
  }
}
const bad = offenders.filter((o) => o.ratio < 0.5 || o.ratio > 2);
console.log(`\n  → 채점 자료가 있는 단계 ${offenders.length}개 중 어긋난 것 ${bad.length}개: ${bad.map((b) => `${b.label}(${b.ratio.toFixed(1)}배)`).join(", ") || "없음"}`);

/* ───────── 2. 출처 품질 — 결과물 전수의 출처 등급 ───────── */
console.log("\n## 2. 출처 품질 — 결과물 31편의 출처를 등급으로 전수\n");
const TIER_ORDER = ["official", "reliable", "reference", "general", "weak"] as const;
const tally: Record<string, number> = {};
const badUrls: { file: string; url: string; why: string }[] = [];
let total = 0;
// 본문 근거로 쓰기 어려운 주소 — 첫 화면(경로 없음)·검색/목록 페이지·누구나 올리는 문서 공유 사이트.
// 내려받기 파일(.pdf)은 **문제로 세지 않는다**(2026-11-08 실측: 빼 봤더니 Scribd 업로드가 그 자리를
// 채우고 출처가 2개로 줄었다 — 출판사·기관의 .pdf는 내용이 고정된 실제 문서다). 참고로만 센다.
const DOWNLOAD = /\.(pdf|hwp|hwpx|docx?|xlsx?|pptx?|zip)(\?|$)/i;
const LISTY = /(?:search|list|board|bbs|category|tag|archive)(?:[/?.]|$)/i;
const UPLOAD_SITE = /(?:scribd|slideshare|studocu|coursehero|docslide|blog\.naver|tistory|wordpress|velog|brunch)\./i;
for (const file of fs.readdirSync(OUT).filter((f) => f.startsWith("fc-") && f.endsWith(".md"))) {
  const md = fs.readFileSync(path.join(OUT, file), "utf8");
  for (const m of md.matchAll(/^\[(\d+)\]\s*(.*?)\s*—\s*(https?:\/\/\S+)\s*$/gm)) {
    const url = m[3];
    total++;
    const tier = classifySourceTier(url);
    tally[tier] = (tally[tier] ?? 0) + 1;
    let why = "";
    try {
      const u = new URL(url);
      if (UPLOAD_SITE.test(u.hostname)) why = "누구나 올리는 문서·블로그";
      else if (isLandingPage(url)) why = "기관 첫 화면";
      else if (isSecondChoicePage(url)) why = "검색·목록 페이지";
      else if (DOWNLOAD.test(u.pathname)) why = "(참고) 내려받기 파일";
      else if (LISTY.test(u.pathname + u.search)) why = "(참고) 목록 낱말이 있으나 문서 페이지";
    } catch {
      why = "주소 형식 오류";
    }
    if (why) badUrls.push({ file, url, why });
  }
}
console.log(`  등급: ${TIER_ORDER.map((t) => `${t} ${tally[t] ?? 0}`).join(" / ")}  (출처 ${total}개)`);
const weakShare = ((tally.general ?? 0) + (tally.weak ?? 0)) / Math.max(1, total);
console.log(`  → general+weak 비율 ${(weakShare * 100).toFixed(0)}%`);
const byWhy: Record<string, number> = {};
for (const b of badUrls) byWhy[b.why] = (byWhy[b.why] ?? 0) + 1;
const realBad = badUrls.filter((b) => !b.why.startsWith("(참고)"));
console.log(`  본문 근거로 쓰기 어려운 주소 ${realBad.length}개: ${Object.entries(byWhy).map(([k, v]) => `${k} ${v}`).join(", ") || "없음"}`);
for (const b of realBad.slice(0, 8)) console.log(`     [${b.why}] ${b.url.slice(0, 95)}  (${b.file})`);

/* ───────── 3. 시간 — 어떤 보완이 예산에 밀리는가 ───────── */
console.log("\n## 3. 시간 — 저장된 로그 전수에서 건너뛴 보완\n");
const skips: Record<string, number> = {};
let logs = 0;
for (const file of fs.readdirSync(OUT).filter((f) => f.endsWith(".log"))) {
  logs++;
  const text = fs.readFileSync(path.join(OUT, file), "utf8");
  for (const m of text.matchAll(/시간 예산 초과\([\d.]+초\) — (.+)/g)) {
    const what = m[1].replace(/\s*건너뜀\s*$/, "").replace(/\(".*?"\)/, "").trim();
    skips[what] = (skips[what] ?? 0) + 1;
  }
}
for (const [k, v] of Object.entries(skips).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}회  ${k}`);
console.log(`  (로그 ${logs}건)`);
