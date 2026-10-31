// 안내문이 하라고 한 것을 결과물이 실제로 했는지, 안내문 문장 하나씩 대조한다.
//
// 왜 필요한가(2026-10-31에 찾은 구조적 빈 칸): 생성 뒤 검사는 전부 "글이 망가졌나"를 본다 —
// 날조 활동·거절문·되풀이·무각주 수치·빈 항목 같은 결함 15종. 그런데 "안내문이 요구한 것을 했나"는
// 아무도 보지 않았다. 그 자리를 메우려고 낱말 검사 규칙(개수 조건·표 요구·자료 제한·근거 개수…)을
// 과제마다 하나씩 늘려 왔지만, 그 규칙들은 전부 특정 안내문 문구에 맞춘 것이라 문구가 다른 과제가
// 오면 그대로 새 빈 칸이 된다. 실측(결과물.7, 국어 매체 발표): 분석은 안내문 요구 7개를 정확히 뽑았는데
// 결과물은 그중 근거-출처 연결·표 실제 작성·제목 형식·대본 조건을 어겼고, 결함 검사 15종은 전부 통과했다.
//
// 그래서 체크리스트를 코드에 적지 않고 **안내문에서 그때그때 만든다**. 과제 유형이 무엇이든 같은 방식으로
// 걸리므로, 과제 하나를 고칠 때마다 규칙을 새로 쓰지 않아도 된다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

export interface RubricItem {
  id: string;
  /** 이 조건을 지켜야 하는 단계. null이면 모든 단계 공통. */
  label: string | null;
  text: string;
}

export interface RubricMiss {
  label: string;
  missing: string[];
}

// 글만 봐서는 지켰는지 알 수 없는 조건 — 배점·제출 방법·수업 운영·필기 도구 같은 것들.
// 이런 문장을 체크리스트에 넣으면 "글에 없다"는 판정이 나오고, 보완이 그 안내를 **글 안에 적어 버린다**.
// 실측(2026-10-31, 과학 산·염기 실험): "2차시는 시험 대형으로 책상 간격을 띄우고 개별 작성한다"가 조건으로 들어가
// "글에 2차시는 시험 대형으로 … 안내를 추가하세요"라는 보완 지시가 나갔다. 수업 운영 안내는 제출할 글의 내용이 아니다.
const NOT_IN_TEXT =
  /배점|점수|점\s*만점|감점\s*기준표|채점표|채점\s*기준|평가\s*기준은|제출\s*(?:기한|일자|일시|방법|처)|기한|마감|파일\s*(?:이름|형식|명)|손\s*글씨|자필|연필|볼펜|검정\s*펜|인쇄|출력|복사|코팅|스테이플|결석|재시험|지참|가져\s*오|준비물|좌석|칠판|책상|시험\s*대형|개별\s*작성|미리\s*공부|자료를\s*볼\s*수\s*없|\d\s*차시|차시에는|모둠\s*편성|제비뽑기|발표\s*(?:시간|순서|차례)|초\s*이내로\s*발표|분\s*이내로\s*발표|말하기\s*시간|대본\s*없이|외워서\s*말|청중\s*기록지|동료\s*평가|상호\s*평가|수업\s*중\s*직접|찬성\s*먼저|반대\s*바로|찬반[을은]?\s*세트/;

// 안내문의 요구사항과 작성 기준(writing_guide)은 같은 조건을 다른 말로 두 번 적는 일이 많다
// (국어 안내문: "8개의 장면으로 스토리보드를 작성한다"와 "스토리보드는 8개 장면이 기본이며…"). 둘 다 넣으면
// 체크리스트가 길어져 판정이 흐려지고 같은 지적이 두 번 나간다 — 글자 2-그램이 많이 겹치면 먼저 들어온 것만 남긴다.
function bigrams(text: string): Set<string> {
  const t = text.replace(/[\s.,·…~()[\]'"“”‘’]/g, "");
  const out = new Set<string>();
  for (let i = 0; i + 1 < t.length; i++) out.add(t.slice(i, i + 2));
  return out;
}

function tooSimilar(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const g of a) if (b.has(g)) shared++;
  return shared / Math.min(a.size, b.size) >= 0.6;
}

// 조건이 아니라 과제 설명·배경일 뿐인 문장(지시가 없으면 대조할 것도 없다).
const HAS_DIRECTIVE =
  /한다|하라|할\s*것|해야|하시오|하세요|쓴다|쓸\s*것|써야|작성|기록|포함|담는다|담을|밝힌다|밝힐|밝혀|제시|설정|구상|수집|선정|조사|활용|사용|나타내|표현|구분|이상|이내|까지|가능|불가|금지|필수/;

const clean = (s: string) =>
  s
    .replace(/^\s*(?:[-*•※■]|\d+[.)]|[①-⑳]|[가-하][.)])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * 안내문 문장을 단계별 체크리스트로 만든다. `shared`/`byLabel`은 requirement-scope의 scopeStatements 결과를
 * 그대로 넘기면 된다(이미 "어느 단계에 적용되는가"를 가려 둔 것이고, withheld는 넘기지 않는다).
 */
export function buildRubric(scoped: { shared: string[]; byLabel: Record<string, string[]> }): RubricItem[] {
  const items: RubricItem[] = [];
  const grams: { label: string | null; g: Set<string> }[] = [];
  const add = (label: string | null, raw: string) => {
    const text = clean(raw);
    if (text.length < 8 || text.length > 220) return;
    if (NOT_IN_TEXT.test(text) || !HAS_DIRECTIVE.test(text)) return;
    const g = bigrams(text);
    // 같은 단계(또는 전체)에 거의 같은 조건이 이미 있으면 넣지 않는다.
    if (grams.some((p) => (p.label === label || p.label === null || label === null) && tooSimilar(g, p.g))) return;
    grams.push({ label, g });
    items.push({ id: `r${items.length + 1}`, label, text });
  };
  for (const s of scoped.shared) add(null, s);
  for (const [label, list] of Object.entries(scoped.byLabel)) for (const s of list) add(label, s);
  // 체크리스트가 길어지면 판정이 흐려지고 보완도 몰린다 — 안내문 조건은 보통 10개를 넘지 않는다.
  return items.slice(0, 14);
}

export function rubricPrompt(items: RubricItem[], sections: { label: string; content: string }[]): string {
  const list = items
    .map((it) => `- ${it.id} [${it.label ?? "전체"}] ${it.text}`)
    .join("\n");
  const body = sections.map((s) => `## ${s.label}\n${s.content}`).join("\n\n");
  return (
    "학생이 제출할 글이 수행평가 안내문의 조건을 지켰는지 조건마다 판정해줘.\n\n" +
    "[판정 규칙]\n" +
    "- 표현이 달라도 글이 그 조건을 실질적으로 지켰으면 ok로 본다. 더 잘 쓸 수 있다는 건 위반이 아니다.\n" +
    "- [단계 이름]이 붙은 조건은 그 단계의 글만 보고 판정한다. [전체]는 글 전부를 보고 판정한다.\n" +
    "- 조건이 요구한 것이 글에 아예 없거나, 개수·형식을 분명히 어겼을 때만 ok=false로 한다.\n" +
    "- 글만 봐서 알 수 없는 조건(발표 시간, 수업 중 수행 등)은 ok=true로 둔다.\n" +
    "- fix에는 그 단계의 글을 어떻게 고치면 조건을 지키는지 한 문장으로 적는다(조건을 되풀이하지 말고, 지금 글에서 무엇이 빠졌는지 짚어서).\n\n" +
    `[안내문 조건]\n${list}\n\n[제출할 글]\n${body}`
  );
}

export interface RubricVerdict {
  results?: { id?: string; ok?: boolean; fix?: string }[];
}

/**
 * 판정 결과를 단계별 보완 지시로 바꾼다. 조건이 [전체]면 `fallbackLabel`(보통 첫 단계)에 붙인다.
 * 한 단계에 너무 많이 붙으면 보완 한 번에 다 담기지 않으므로 단계마다 최대 3개만 남긴다.
 */
export function rubricMisses(
  verdict: RubricVerdict,
  items: RubricItem[],
  sectionLabels: string[],
  fallbackLabel?: string
): RubricMiss[] {
  const byLabel = new Map<string, string[]>();
  for (const r of verdict.results ?? []) {
    if (r?.ok !== false) continue;
    const item = items.find((it) => it.id === r.id);
    if (!item) continue;
    const label = item.label && sectionLabels.includes(item.label) ? item.label : fallbackLabel ?? sectionLabels[0];
    if (!label) continue;
    const fix = (r.fix ?? "").trim();
    const line = fix.length >= 6 ? `${item.text} → ${fix}` : item.text;
    const list = byLabel.get(label) ?? [];
    if (list.length < 3 && !list.includes(line)) list.push(line);
    byLabel.set(label, list);
  }
  return [...byLabel.entries()].map(([label, missing]) => ({ label, missing }));
}

export function rubricRepairText(missing: string[]): string {
  return (
    `안내문 조건을 지키지 못한 부분이 있다. 아래를 지키도록 이 단계의 글을 고칠 것 — ` +
    missing.map((m, i) => `(${i + 1}) ${m}`).join(" ") +
    ` 이미 지킨 내용과 각주는 그대로 두고, 빠진 것을 채우거나 어긴 형식만 바로잡을 것.`
  );
}
