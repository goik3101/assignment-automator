// 안내문의 필수 항목 이름이 여러 가지를 나열한 것이면("글의 목적·주제·예상 독자"), 채점자는 그 안에서 **각각을** 찾는다.
// 한 문단에 녹여 쓰면 셋 다 썼는지 보이지 않아 ①번 기준에서 깎인다.
//
// 실측(2026-11-01, 사용자 결과물.8 + 안내문 사진): 안내문 세부 평가 기준 ①은 "글의 목적, 주제, 예상 독자를 구체적으로
// 설정하고"이고, 사용자가 받은 실제 시험지는 칸마다 따로 적는 양식이었다. 그런데 결과물은 세 가지를 한 문단에 묶어
// "…것이 목적이다. 주제는 '…'이며, … 쉬운 말로 전한다."로 썼다.
// 근거 개수(evidence-items.ts)에서 배운 것과 같은 모양이다 — **채점자가 세는 것은 세어지게 써야 한다.**
//
// 판정은 항목 **이름**만 본다(글 내용이 아니라). 이름이 나열형이 아니면 건드리지 않으므로, 한 문단으로 써야 하는
// 항목("느낀 점", "뒷받침하는 정보 3가지 이상")은 예전 그대로다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

const TRIM = (s: string) => s.replace(/^[\s·,、]+|[\s·,、]+$/g, "").trim();

/** 나열 기호로 나뉜 조각들. 기호가 없으면 null. */
function bySymbol(name: string): string[] | null {
  if (!/[·・、]|,\s/.test(name)) return null;
  const parts = name.split(/[·・、]|,\s*/).map(TRIM).filter((p) => p.length >= 2);
  return parts.length >= 2 ? parts : null;
}

/**
 * "과/와"로 나뉜 조각들. 이것만은 조심해야 한다 — "산과 염기의 특징"을 "산"/"염기의 특징"으로 쪼개면 안 된다.
 * 양쪽이 **같은 끝말**로 끝날 때만 나열로 본다("중심 내용과 세부 내용" → 둘 다 "내용").
 */
function byConjunction(name: string): string[] | null {
  const m = /^(.{2,20}?)(?:과|와)\s+(.{2,20})$/.exec(name.trim());
  if (!m) return null;
  const [a, b] = [TRIM(m[1]), TRIM(m[2])];
  const tail = (s: string) => s.split(/\s+/).at(-1) ?? "";
  if (!tail(a) || tail(a) !== tail(b)) return null;
  return [a, b];
}

/** 이 항목 이름이 여러 가지를 나열한 것이면 조각들을, 아니면 null. */
export function splitCompoundItem(name: string): string[] | null {
  const n = TRIM(name ?? "");
  if (n.length < 4 || n.length > 60) return null;
  // 개수 조건이 붙은 이름("근거 3가지 이상")은 나열이 아니라 하나의 항목이다.
  if (/\d\s*(?:가지|개|편|장면|문장|문단)\s*(?:이상|이내|까지)?/.test(n)) return null;
  const parts = bySymbol(n) ?? byConjunction(n);
  if (!parts || parts.length < 2 || parts.length > 5) return null;
  // "글의 목적"처럼 앞머리 수식이 붙은 첫 조각은 그대로 둔다(제목으로 쓸 이름이므로).
  return parts;
}

export interface CompoundItem {
  name: string;
  parts: string[];
}

export function compoundItems(names: string[]): CompoundItem[] {
  const out: CompoundItem[] = [];
  for (const name of names ?? []) {
    const parts = splitCompoundItem(name);
    if (parts) out.push({ name, parts });
  }
  return out;
}

export function compoundItemBlock(items: CompoundItem[]): string {
  if (items.length === 0) return "";
  return (
    `\n【나열된 항목 — 반드시 지킬 것】 채점자는 아래 항목 안에서 나열된 것을 **하나씩** 찾는다. ` +
    `한 문단에 녹여 쓰지 말고, 나열된 것마다 줄을 나눠 "이름: 내용" 꼴로 각각 쓸 것.\n` +
    items.map((it) => `- "${it.name}" → ${it.parts.map((p) => `"${p}: …"`).join(", ")} 줄을 각각 쓴다.`).join("\n") +
    `\n각 줄의 내용은 한 문장으로 끝내지 말고 과제에 맞게 구체적으로 쓴다(이름만 적고 비워 두지 말 것).\n`
  );
}

/** 글에서 그 항목 구간(### 소제목 기준)을 꺼낸다. 없으면 null. */
export function sectionTextFor(content: string, name: string): string | null {
  const lines = content.split("\n");
  const key = name.replace(/\s/g, "");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = /^#{3,4}\s+(.+?)\s*$/.exec(lines[i]);
    if (!m) continue;
    if (start >= 0) return lines.slice(start, i).join("\n");
    if (m[1].replace(/\s/g, "").includes(key) || key.includes(m[1].replace(/\s/g, ""))) start = i + 1;
  }
  return start >= 0 ? lines.slice(start).join("\n") : null;
}

/** 그 구간에서 조각 이름이 줄머리 표지로 나오지 않은 것들. 전부 나오면 빈 배열. */
export function missingParts(sectionText: string, parts: string[]): string[] {
  const heads = sectionText
    .split("\n")
    .map((l) => /^\s*(?:[-*•]|\d+[.)])?\s*\*{0,2}([^:：\n]{2,24})\*{0,2}\s*[:：]/.exec(l)?.[1] ?? "")
    .map((h) => h.replace(/\s/g, ""))
    .filter(Boolean);
  return parts.filter((p) => {
    const k = p.replace(/\s/g, "");
    // "글의 목적"은 "목적:"으로 적어도 인정한다(앞머리 수식은 빼고 본다).
    const bare = k.replace(/^(?:글의|발표의|이\s*글의)/, "");
    return !heads.some((h) => h.includes(k) || k.includes(h) || (bare.length >= 2 && h.includes(bare)));
  });
}

export function compoundRepairText(name: string, parts: string[], missing: string[]): string {
  return (
    `"${name}" 항목은 ${parts.length}가지를 나열한 것이라 채점자가 하나씩 찾는다. ` +
    `지금은 ${missing.length === parts.length ? "한 문단에 뭉쳐 있어 어느 것이 무엇인지 보이지 않는다" : `${missing.map((m) => `"${m}"`).join(", ")}이(가) 따로 보이지 않는다`}. ` +
    `${parts.map((p) => `"${p}: …"`).join(", ")}처럼 줄을 나눠 각각 쓸 것. 내용은 지금 쓴 것을 나눠 담되, 한 줄도 비우지 말고 빠진 것은 채울 것. 각주는 그대로 둘 것.`
  );
}

// 분석 결과의 required_items는 **절반쯤만 채워진다**(실측 2026-11-01, 같은 사진 11회: 4개로 채워진 실행과
// 비어 있는 실행이 거의 반반). 거기에만 기대면 이 규칙도 절반만 돈다. 그래서 안내문 문장에서도 같은 것을 뽑는다 —
// 요구사항·작성 기준 글은 항목 이름보다 훨씬 덜 흔들린다("글의 목적, 주제, 예상 독자를 구체적으로 설정하고").
// "…를 설정한다" 앞의 덩어리를 먼저 끊고, 그 덩어리의 나열만 떼어 낸다. 한 정규식으로 잡으려다
// 문장 전체를 집어삼킨 적이 있어(실측) 두 단계로 나눈다.
const ENUM_CLAUSE =
  /([^.。\n]{4,60}?)(?:을|를)\s*(?:각각\s*|구체적으로\s*|모두\s*)?(?:설정|구상|작성|기록|제시|정리|밝히|담|쓴다|써야|구분|나누)/g;
/** 앞에 붙은 자리말("개요에는", "그에 맞게")을 뗀다. */
const LEAD = /^(?:[가-힣A-Za-z0-9]+(?:\s+[가-힣A-Za-z0-9]+){0,2}\s*(?:에\s*대해|에\s*관해|에\s*대하여|을\s*위해)\s+|[가-힣A-Za-z0-9]+(?:에는|에서는|에게|에|게|서는|서|로는|로|고는|고|며)\s+)/;

function stripLead(part: string): string {
  let t = TRIM(part);
  for (let i = 0; i < 3; i++) {
    const next = TRIM(t.replace(LEAD, ""));
    if (next === t || next.split(/\s+/).length === 0 || next.length < 2) break;
    t = next;
  }
  return t;
}

/** 안내문 문장에서 "A·B·C를 …한다" 꼴로 나열된 항목 이름을 찾는다. */
export function compoundItemsFromText(texts: (string | undefined)[]): CompoundItem[] {
  const out: CompoundItem[] = [];
  const seen = new Set<string>();
  for (const t of texts) {
    for (const m of (t ?? "").matchAll(ENUM_CLAUSE)) {
      // 앞 절이 "…설정하고, 그에 맞게 …"처럼 이어지면 연결 꼬리가 첫 조각으로 들어온다 — 떼고 본다.
      const clause = TRIM(TRIM(m[1]).replace(/^(?:하고|하며|하여|해서|한\s*뒤|한\s*다음|그리고)[,\s]*/, ""));
      const raw = splitCompoundItem(clause);
      if (!raw) continue;
      const parts = [stripLead(raw[0]), ...raw.slice(1).map(TRIM)].filter((p) => p.length >= 2);
      if (parts.length < 2) continue;
      const joined = parts.join("|");
      if (seen.has(joined)) continue;
      // 쪼갠 결과가 다시 나열로 보이면(조각 안에 또 나열 기호가 있으면) 믿지 않는다.
      if (parts.some((p) => splitCompoundItem(p))) continue;
      // 조각이 항목 이름이라기엔 너무 길면 문장을 잘못 끊은 것이다 — 글에서 그 이름을 찾을 수 없어 헛보완만 부른다.
      if (parts.some((p) => p.length > 24)) continue;
      seen.add(joined);
      out.push({ name: parts.join("·"), parts });
    }
  }
  return out;
}

/** required_items에서 뽑은 것과 안내문 글에서 뽑은 것을 합친다(같은 조각들이면 한 번만). */
export function allCompoundItems(names: string[], texts: (string | undefined)[]): CompoundItem[] {
  const out = compoundItems(names);
  const seen = new Set(out.map((i) => i.parts.join("|")));
  for (const it of compoundItemsFromText(texts)) {
    if (seen.has(it.parts.join("|"))) continue;
    seen.add(it.parts.join("|"));
    out.push(it);
  }
  return out;
}
