// 같은 글 안에서 거의 같은 문장이 여러 항목·단계에 되풀이되는지 찾는다(실측: 자료 수집의 불릿이 신문 제작에 거의 그대로 다시 나옴).
// 의미 판단이 아니라 글자 겹침(문자 2-gram Dice)으로 보므로 "거의 같은 문장"만 잡고, 말만 바꾼 중복은 잡지 못한다.

export interface Statement {
  label: string;
  /** 소제목(### 항목명)이 있으면 그 이름. 없으면 "" */
  item: string;
  text: string;
}

export interface RepeatedPair {
  a: Statement;
  b: Statement;
  score: number;
}

const MIN_LEN = 18;

function normalize(s: string): string {
  return s
    .replace(/\[\d+\]/g, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
    .replace(/\(해석\)|\(학생 감상 초안[^)]*\)/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na.length < 2 || nb.length < 2) return 0;
  if (na === nb) return 1;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let inter = 0;
  for (const [g, c] of ga) inter += Math.min(c, gb.get(g) ?? 0);
  return (2 * inter) / (na.length - 1 + (nb.length - 1));
}

/** 마크다운 본문을 문장·불릿 단위 Statement로 쪼갠다(표 줄과 소제목은 제외). */
export function toStatements(label: string, content: string): Statement[] {
  const out: Statement[] = [];
  let item = "";
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^#{3,4}[ \t]+(.+)$/);
    if (h) {
      item = h[1].trim();
      continue;
    }
    if (line.startsWith("|") || /^#{1,2}\s/.test(line)) continue;
    // 한 줄 안에 문장이 여러 개면 문장 끝 기호(마침표 뒤 공백, 각주 뒤)로 나눈다.
    for (const part of line.split(/(?<=[.!?다요][\]]*)\s+(?=\S)/)) {
      if (normalize(part).length >= MIN_LEN) out.push({ label, item, text: part.trim() });
    }
  }
  return out;
}

/**
 * 서로 다른 항목(같은 단계의 다른 소제목이거나 다른 단계)에 거의 같은 문장이 있는 쌍을 찾는다.
 * 같은 항목 안에서의 반복은 문체 문제라 여기서 다루지 않는다.
 */
export function findRepeatedStatements(
  sections: { label: string; content: string }[],
  threshold = 0.72
): RepeatedPair[] {
  const all = sections.flatMap((s) => toStatements(s.label, s.content));
  const pairs: RepeatedPair[] = [];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      if (a.label === b.label && a.item === b.item) continue;
      const score = similarity(a.text, b.text);
      if (score >= threshold) pairs.push({ a, b, score });
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}

/** 재생성 지시에 넣을 한 줄 설명(문장은 앞부분만). */
export function describePair(p: RepeatedPair): string {
  const where = (s: Statement) => `${s.label}${s.item ? ` > ${s.item}` : ""}`;
  const clip = (t: string) => t.replace(/\[\d+\]/g, "").slice(0, 40);
  return `"${clip(p.a.text)}…" (${where(p.a)} ↔ ${where(p.b)})`;
}
