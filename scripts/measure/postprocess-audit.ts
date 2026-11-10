// 생성 뒤 **후처리 사슬**을 전수로 본다(모델 호출 없음, 비용 0).
//
// 왜 필요한가(2026-11-10): 이 사슬은 단계마다 글을 한 번씩 고치는 함수 18개가 **정해진 순서로** 돌고,
// 그 순서가 `generate-essay.ts` 안에 인라인으로만 있다. 오늘 찾은 버그 셋이 전부 여기서 나왔다.
//   - `splitProductionNotes`가 만평 칸을 비웠다(모델이 그 칸 내용을 "제작 참고"에 썼다).
//   - 짝 안 맞는 대괄호 정리가 `붙일 자료:` 표시를 지워 붙임 칸 관문을 껐다.
//   - `stripImageMarkup`이 "### 제작 참고"를 붙이는데, 그림 칸은 그걸 떼지 않게 바꿨다(내가 만든 순서 버그).
//
// 이 감사가 보는 것:
//  ① **멱등성** — f(f(x)) ≠ f(x)인 함수. 두 번 돌리면 더 지운다는 뜻이고, 사슬에서 앞 함수가 글을 바꾸면
//     같은 자리에 두 번 작용할 수 있다.
//  ② **순서 의존** — g(f(x)) ≠ f(g(x))인 짝. 순서를 바꾸면 결과가 달라지는 짝이 바로 버그가 사는 자리다.
//  ③ **남아서는 안 되는 표시** — 사슬을 다 통과한 저장된 결과물에 제출 글에 있을 수 없는 표시가 남았는지.
//
// 사용: node --import ./scripts/measure/loader/register.mjs scripts/measure/postprocess-audit.ts
import fs from "node:fs";
import path from "node:path";
const REPO = process.cwd();
process.loadEnvFile(path.join(REPO, ".env.local"));

const D = await import("@/lib/essay/deliverable");
const A = await import("@/lib/essay/ascii-art");
const P = await import("@/lib/essay/picture-panel");
const PC = await import("@/lib/essay/plan-citations");
const C = await import("@/lib/gemini/citations");
const PS = await import("@/lib/essay/paste-slot");
const EG = await import("@/lib/essay/english-grammar");
const RF = await import("@/lib/essay/refusal");

/** 사슬에 실제로 도는 순서대로. `content`만 꺼내 문자열 → 문자열로 맞춘다. */
const take = (r: unknown): string => (typeof r === "string" ? r : ((r as { content?: string })?.content ?? ""));
/**
 * 실제 사슬에서 **조건이 붙어** 도는 단계는 그 조건을 함께 적는다. 조건을 무시하고 전부에 돌리면
 * 거짓 경고가 난다 — 실측(2026-11-11): 붙임 칸 함수를 개요·만평에까지 돌려 "순서 의존 2짝"이 떴는데,
 * 실제 사슬에서는 스크랩·부착 단계에서만 돌아 생길 수 없는 짝이었다.
 */
const isNewspaperLabel = (l) => /머리기사|인터뷰|사설|칼럼|만평|광고/.test(l.replace(/\s/g, ""));
const isAttachLabel = (l) => /스크랩|오려\s*붙|붙이기|부착/.test(l);
const isPanelLabel = (l) => /만평|광고|만화|풍자|삽화/.test(l.replace(/\s/g, ""));
const looksEnglish = (t) => /[A-Za-z]{3,}\s+[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(t);

const STEPS: { name: string; run: (t: string) => string; when?: (label: string, text: string) => boolean }[] = [
  { name: "모델 참고목록 제거", run: (t) => take(D.stripModelReferenceBlock(t)) },
  { name: "작업 설명 괄호줄 제거", run: (t) => take(D.stripMetaNoteLines(t)) },
  { name: "작업 표지 제거(신문)", run: (t) => take(D.stripWorkMarkers(t)), when: (l) => isNewspaperLabel(l) },
  { name: "소제목 속 지시 제거", run: (t) => take(D.stripHeadingDirectives(t)) },
  { name: "탭 표 → 마크다운", run: (t) => take(D.tabTableToMarkdown(t)) },
  { name: "양식 정의 앞머리 제거", run: (t) => take(D.stripFormLead(t)) },
  { name: "작업 메모 제거", run: (t) => take(D.stripWorkNotes(t)) },
  { name: "본문 주소 제거", run: (t) => take(D.stripInlineUrls(t)) },
  { name: "전달형 꼬리 정리", run: (t) => take(D.reduceReportedSpeech(t)) },
  { name: "제목 뒤 조사 정리", run: (t) => take(D.fixJosaAfterTitle(t)) },
  { name: "서수 나열 제거", run: (t) => take(D.stripOrdinalEnumerators(t)) },
  { name: "그림 칸 각주 제거", run: (t) => take(P.stripPanelCitations(t)) },
  { name: "아스키 아트 제거", run: (t) => take(A.stripAsciiArt(t)) },
  { name: "이미지 표시 제거", run: (t) => take(A.stripImageMarkup(t)) },
  { name: "계획 문장 각주 제거", run: (t) => take(PC.stripPlanCitations(t)) },
  { name: "출력 글 다듬기", run: (t) => take(C.tidyOutputText(t)) },
  // ── 여기부터는 실제 사슬에서 **조건이 붙어** 도는 단계들이다(신문일 때만, 영어일 때만, 붙임 칸일 때만…).
  // 2026-11-11에 감사가 이것들을 아예 안 보고 있던 것을 찾았다 — 하필 전날 버그가 난 함수들이다.
  // 조건은 과제마다 다르지만 **함수 자체의 멱등성과 다른 단계와의 순서 의존**은 조건과 무관하게 확인할 수 있다.
  { name: "다른 영역 소제목 제거(신문)", run: (t) => take(D.stripOtherAreaSubsections(t, "머리기사", ["머리기사", "인터뷰", "사설/칼럼", "만평/광고"])), when: (l) => isNewspaperLabel(l) },
  { name: "밑줄 코드로 긋기(영어)", run: (t) => take(EG.underlineGrammarForms(t, ["passive", "relative", "emphasis"] as never)), when: (_l, t) => looksEnglish(t) },
  { name: "붙임 칸 서지 비우기", run: (t) => take(PS.blankPastedMetadata(t)), when: (l) => !isAttachLabel(l) },
  { name: "붙임 칸 바로잡기", run: (t) => take(PS.normalizeAttachmentSlot(t, RF.findRefusalSentences)), when: (l) => isAttachLabel(l) },
  { name: "제작 참고 떼기(글 칸)", run: (t) => D.splitProductionNotes(t).body, when: (l) => !isPanelLabel(l) },
  { name: "제작 참고 라벨만 떼기(그림 칸)", run: (t) => take(D.dropProductionNotesHeading(t)), when: (l) => isPanelLabel(l) },
];

/**
 * 감사가 실제 사슬의 함수를 **빠짐없이** 보고 있는지 스스로 확인한다.
 *
 * 왜(2026-11-11): 이 목록은 `generate-essay.ts`의 인라인 사슬을 **손으로 베낀 것**이라 어긋날 수 있다.
 * 실제로 어긋나 있었다 — 사슬에 21개가 도는데 감사는 16개만 보고 있었고, 빠진 6개가 전날 버그가 난 함수들이었다.
 * 그래서 사슬 코드에서 함수 이름을 긁어 이 목록과 맞춰 보고, 빠진 것이 있으면 경고한다.
 * (근본 해결은 사슬을 이름 붙인 목록으로 꺼내 양쪽이 같은 것을 쓰는 것이다 — 아직 안 했다.)
 */
function missingFromAudit(): string[] {
  const src = fs.readFileSync(path.join(REPO, "src", "lib", "gemini", "generate-essay.ts"), "utf8");
  const chain = src.split(String.fromCharCode(10)).slice(3220, 3440).join(String.fromCharCode(10));
  const called = new Set(
    [...chain.matchAll(/\b((?:strip|fix|reduce|tab|tidy|normalize|blank|underline|split|drop)[A-Za-z]+)\s*\(/g)].map((m) => m[1])
  );
  const audited = new Set(
    [...fs
      .readFileSync(path.join(REPO, "scripts", "measure", "postprocess-audit.ts"), "utf8")
      .matchAll(/[A-Z]{1,2}\.((?:strip|fix|reduce|tab|tidy|normalize|blank|underline|split|drop)[A-Za-z]+)\(/g)].map((m) => m[1])
  );
  return [...called].filter((n) => !audited.has(n)).sort();
}

/**
 * 그 단계 안의 **"### 출처" 칸**을 뗀다. 안내문 양식에 출처 칸이 있으면 `buildSourceListSection`이
 * 확인된 출처를 주소까지 채워 넣는다 — 결함이 아니다(2026-11-10에 이 감사가 18건을 거짓으로 찍었다).
 */
function withoutSourceField(body: string): string {
  const out: string[] = [];
  let skipping = false;
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (/^#{3,4}\s*(?:출처|참고\s*자료|자료\s*출처)/.test(t)) {
      skipping = true;
      continue;
    }
    if (/^#{2,4}\s\S/.test(t)) skipping = false;
    if (!skipping) out.push(line);
  }
  return out.join("\n");
}

/** 제출할 글에 남아서는 안 되는 표시. 사슬이 다 돌았는데도 남아 있으면 순서 문제이거나 관문이 꺼진 것이다. */
const FORBIDDEN: { name: string; re: RegExp; onBody?: (b: string) => string }[] = [
  { name: "제작 참고 소제목", re: /^#{2,4}\s*제작\s*참고/m },
  { name: "이미지 마크업", re: /!\[[^\]]*\]\([^)]*\)/ },
  { name: "본문 속 주소", re: /(?<!\] *\()https?:\/\/\S+/, onBody: withoutSourceField },
  { name: "코드블록", re: /```/ },
  { name: "내부 지시 표지", re: /\[(?:내부|지시|작성\s*지침|주의)[^\]]*\]/ },
];

const OUT = path.join(REPO, "scratchpad", "measure", "out");
type Sec = { file: string; label: string; text: string };
const secs: Sec[] = [];
for (const file of fs.readdirSync(OUT).filter((f) => f.startsWith("fc-") && f.endsWith(".md"))) {
  const raw = fs.readFileSync(path.join(OUT, file), "utf8").split("\n## 출처")[0];
  const heads = [...raw.matchAll(/^## (.+)$/gm)];
  for (let i = 0; i < heads.length; i++) {
    const label = heads[i][1].trim();
    if (label === "제작 참고") continue;
    const body = raw.slice(heads[i].index! + heads[i][0].length, i + 1 < heads.length ? heads[i + 1].index! : raw.length);
    if (body.trim()) secs.push({ file, label, text: body });
  }
}

console.log(`=== 저장된 결과물의 단계 ${secs.length}개로 후처리 사슬을 본다 ===`);

const missing = missingFromAudit();
if (missing.length > 0) {
  console.log(`
⚠ **이 감사가 안 보고 있는 사슬 함수 ${missing.length}개**: ${missing.join(", ")}`);
  console.log(`   (감사 목록은 사슬을 손으로 베낀 것이다 — 사슬에 단계를 더하면 이 목록에도 더할 것)`);
} else {
  console.log(`사슬의 함수를 빠짐없이 보고 있다`);
}

// ① 멱등성
console.log(`\n## ① 두 번 돌리면 결과가 달라지는 함수`);
let nonIdem = 0;
for (const st of STEPS) {
  const bad = secs.filter((s) => {
    if (st.when && !st.when(s.label, s.text)) return false;
    try {
      const once = st.run(s.text);
      return st.run(once) !== once;
    } catch {
      return false;
    }
  });
  if (bad.length > 0) {
    nonIdem++;
    console.log(`   ⚠ ${st.name.padEnd(20)} ${bad.length}개 단계에서 두 번째 실행이 더 바꿨다  예: ${bad[0].file} [${bad[0].label}]`);
  }
}
if (nonIdem === 0) console.log("   전부 멱등(두 번 돌려도 같다)");

// ② 순서 의존
console.log(`\n## ② 순서를 바꾸면 결과가 달라지는 짝`);
const pairs: { a: string; b: string; n: number; ex: Sec }[] = [];
for (let i = 0; i < STEPS.length; i++) {
  for (let j = i + 1; j < STEPS.length; j++) {
    const f = STEPS[i];
    const g = STEPS[j];
    // 공백·빈 줄만 다른 것은 경고하지 않는다 — 두 함수가 같은 자리를 정리하면서 줄바꿈을 다르게 접는 것뿐이다
    // (실측 2026-11-10: "모델 참고목록 제거 ↔ 작업 메모 제거"가 17단계에서 걸렸는데 차이가 글자 2개, 줄 단위 차이는 0이었다).
    const same = (x: string, y: string) => x.replace(/\s+/g, " ").trim() === y.replace(/\s+/g, " ").trim();
    const bad = secs.filter((s) => {
      // 두 단계가 **같은 글에서 둘 다 도는** 경우만 순서를 따진다(조건이 다르면 같은 자리에서 만나지 않는다).
      if (f.when && !f.when(s.label, s.text)) return false;
      if (g.when && !g.when(s.label, s.text)) return false;
      try {
        return !same(g.run(f.run(s.text)), f.run(g.run(s.text)));
      } catch {
        return false;
      }
    });
    if (bad.length > 0) pairs.push({ a: f.name, b: g.name, n: bad.length, ex: bad[0] });
  }
}
for (const p of pairs.sort((x, y) => y.n - x.n))
  console.log(`   ⚠ ${p.a} ↔ ${p.b}  ${p.n}개 단계  예: ${p.ex.file} [${p.ex.label}]`);
if (pairs.length === 0) console.log("   순서를 바꿔도 같다");

// ③ 남아서는 안 되는 표시
console.log(`\n## ③ 사슬을 다 통과한 글에 남은 표시`);
let left = 0;
for (const fb of FORBIDDEN) {
  const view = (s: Sec) => (fb.onBody ? fb.onBody(s.text) : s.text);
  const hit = secs.filter((s) => fb.re.test(view(s)));
  if (hit.length > 0) {
    left += hit.length;
    console.log(`   ⚠ ${fb.name.padEnd(16)} ${hit.length}개 단계  예: ${hit[0].file} [${hit[0].label}]`);
    for (const h of hit.slice(0, 3)) console.log(`        ${h.file} [${h.label}]: ${(view(h).match(fb.re)?.[0] ?? "").slice(0, 70)}`);
  }
}
if (left === 0) console.log("   남은 표시 없음");

console.log(
  `\n=== 멱등 아님 ${nonIdem}개 / 순서 의존 짝 ${pairs.length}개 / 남은 표시 ${left}건 ===\n` +
    `순서 의존 짝은 "사슬 순서를 바꾸면 결과가 달라진다"는 뜻이다 — 그 자리에서 한 함수가 다른 함수의 작용을 지우거나 되돌릴 수 있다.`
);
