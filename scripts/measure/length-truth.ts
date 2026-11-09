// "알맞은 분량"의 기준을 **우리 추측이 아니라 채점된 결과물**에서 뽑는다(모델 호출 0).
//
// 왜: 지금 분량 목표는 코드에 박힌 역할 표(`length-plan.ts`)에서 나온다. 그 표가 틀리면 결과물이 통째로
// 어긋나는데(실측: `신문 기사 스크랩`은 표가 900~1500자를 주지만 만점 결과물은 172~204자),
// 표가 맞는지 확인할 기준이 없었다. 유일하게 믿을 수 있는 기준은 **정답 체크리스트로 채점된 결과물의 실제 분량**이다.
//
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/length-truth.ts
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
const OUT = path.join(REPO, "scratchpad/measure/out");

/**
 * 사람이 PROGRESS.md에서 옮겨 적은 채점 결과(파일 → 점수). truth.ts의 체크리스트와 같은 성격이다 —
 * 안내문 사진을 사람이 읽어 만든 정답으로 채점한 값만 넣는다. 추정·기억으로 채우지 말 것.
 */
const SCORED: Record<string, string> = {
  "fc-카드뉴스(역사)_new.md": "9/9",
  "fc-카드뉴스(역사)_fix.md": "8/9",
  "fc-카드뉴스(역사)_len.md": "7/9",
  "fc-카드뉴스(역사)_title.md": "6/9",
  "fc-카드뉴스(역사)_share.md": "7/9",
  "fc-카드뉴스(역사)_f200.md": "6/9",
  "fc-카드뉴스(역사)_final.md": "7/9",
  "fc-신문(역사)_len.md": "11/11",
  "fc-과학(산·염기)_src.md": "11/11",
  "fc-과학(산·염기)_t3.md": "11/11",
  "fc-사회 평가지_role.md": "6/6",
  "fc-과학(산·염기)_len.md": "11/11",
  "fc-국어(발표)_len.md": "11/12",
};

/** 본문이 아닌 꼬리 영역 — 출처 목록·제작 참고는 분량에서 뺀다(결함 검사기와 같은 규칙). */
const TAIL = /^(출처|참고\s*자료|제작\s*참고|조사\s*노트)/;

interface Section {
  label: string;
  chars: number;
}

function sections(md: string): Section[] {
  const out: Section[] = [];
  const parts = md.split(/^## /m).slice(1);
  for (const p of parts) {
    const nl = p.indexOf("\n");
    const label = (nl < 0 ? p : p.slice(0, nl)).trim();
    if (TAIL.test(label)) continue;
    const body = nl < 0 ? "" : p.slice(nl + 1);
    out.push({ label, chars: body.replace(/\s+/g, " ").trim().length });
  }
  return out;
}

/** 파일 이름에서 안내문 이름과 꼬리표를 가른다: "fc-신문(역사)_len.md" → ["신문(역사)", "len"] */
function split(file: string): [string, string] {
  const base = file.replace(/^fc-/, "").replace(/\.md$/, "");
  const at = base.lastIndexOf("_");
  return at > 0 ? [base.slice(0, at), base.slice(at + 1)] : [base, "-"];
}

/**
 * `truth.ts`가 채점할 때 쌓아 두는 파일. 손으로 옮겨 적은 위 표(SCORED)와 **합쳐** 쓴다 —
 * 2026-11-10까지는 손으로 옮긴 13편뿐이어서 결과물 101편의 대부분을 근거로 쓸 수 없었다.
 * 같은 파일이 양쪽에 있으면 **자동 기록이 이긴다**(체크리스트를 고친 뒤 다시 채점한 값이기 때문).
 */
function loadRecordedScores(): Record<string, string> {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(REPO, "scratchpad", "measure", "scores.json"), "utf8")) as Record<
      string,
      { score?: string }
    >;
    const out: Record<string, string> = {};
    for (const [file, v] of Object.entries(raw)) if (v?.score) out[file] = v.score;
    return out;
  } catch {
    return {};
  }
}
const ALL_SCORED: Record<string, string> = { ...SCORED, ...loadRecordedScores() };

const byCase = new Map<string, { tag: string; file: string; secs: Section[] }[]>();
for (const file of fs.readdirSync(OUT).filter((f) => f.startsWith("fc-") && f.endsWith(".md")).sort()) {
  const [id, tag] = split(file);
  const secs = sections(fs.readFileSync(path.join(OUT, file), "utf8"));
  if (secs.length === 0) continue;
  if (!byCase.has(id)) byCase.set(id, []);
  byCase.get(id)!.push({ tag, file, secs });
}

for (const [id, runs] of [...byCase].sort()) {
  console.log(`\n### ${id}  (실행 ${runs.length}회)`);
  for (const r of runs) {
    const score = ALL_SCORED[r.file];
    console.log(
      `   ${score ? `[${score}]` : "[ 미채점 ]"} ${r.tag.padEnd(10)} ${r.secs.map((s) => `${s.label}=${s.chars}`).join("  ")}`
    );
  }
  // 채점된 실행만으로 단계별 범위를 만든다 — 이것이 "알맞은 분량"의 유일한 근거다.
  const scored = runs.filter((r) => ALL_SCORED[r.file]);
  const full = scored.filter((r) => {
    const [a, b] = ALL_SCORED[r.file].split("/").map(Number);
    return a === b;
  });
  for (const group of [
    { name: "만점 실행", list: full },
    { name: "채점 전체", list: scored },
  ]) {
    if (group.list.length === 0) continue;
    const perLabel = new Map<string, number[]>();
    for (const r of group.list) for (const s of r.secs) perLabel.set(s.label, [...(perLabel.get(s.label) ?? []), s.chars]);
    const parts = [...perLabel].map(([l, ns]) => `${l} ${Math.min(...ns)}~${Math.max(...ns)}자`);
    console.log(`   → ${group.name}(${group.list.length}회): ${parts.join(" / ")}`);
  }
}

const scoredCount = Object.keys(ALL_SCORED).length;
console.log(`\n=== 결과물 ${[...byCase.values()].reduce((n, r) => n + r.length, 0)}편 중 채점된 것 ${scoredCount}편 ===`);
console.log("채점된 실행이 적은 안내문은 '만점 범위'를 근거로 쓸 수 없다(표본 수를 함께 보고할 것).");
