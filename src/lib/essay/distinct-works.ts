// "시집에서 작품 3개를 골라 각각 수행" 같은 안내문에서 **차시마다 서로 다른 작품**을 배정한다. alias import 없음.
//
// 왜(2026-11-26, 국어-02 안내문 사진과 대조): 분석은 "작품 3개를 골라 각각 수행"을 요구사항에 정확히 적었는데, 1·2·3차시 활동지가 따로 동시에 쓰이다 보니
// 셋 모두 조사 사실의 첫 작품 「이별의 원심력」 하나를 골랐고(서로의 선택을 못 본다) 종합 활동지만 세 작품을 말해 서로 어긋났다.
// 새 호출 없이: 학생이 지침에 적은 작품(「」)이 있으면 그것을, 없으면 이미 받은 조사 사실(시집 목차 등)의 작품 제목을 차례로 배정한다. 못 구하면 아무것도 안 한다.
// 되돌리기: DISTINCT_WORKS=off

const NUM: Record<string, number> = { 두: 2, 세: 3, 네: 4, "2": 2, "3": 3, "4": 4 };
// "(시집에서) 작품 3개를 골라 각각", "3편의 시를 선정하여 각각"
const PICK_EACH = /(?:(두|세|네|2|3|4)\s*(?:개|편)(?:의)?\s*(?:작품|시|글)|(?:작품|시|글)\s*(두|세|네|2|3|4)\s*(?:개|편))[^.\n]{0,14}(?:골라|선정|선택|고르)[^.\n]{0,14}각각/;
// 분석이 같은 사진을 "1차시 활동지"·"활동지 1차시"·"감상활동지(1)"처럼 다르게 이름 붙인다(4회 분석 4가지, 2026-11-26).
const STEP_ORDER = /(?:^|\D)([1-4])\s*차시|[(（]([1-4])[)）]|활동지\s*([1-4])(?!\d)/;
function stepOrder(label: string): number {
  const m = STEP_ORDER.exec(label);
  return Number(m?.[1] ?? m?.[2] ?? m?.[3] ?? 0);
}
const SUMMARY_STEP = /종합|총평|최종|마무리/;

/** 안내문이 서로 다른 작품 몇 개를 골라 각각 수행하라고 하는가(없으면 0). */
export function distinctWorkCount(texts: (string | undefined)[]): number {
  if (process.env.DISTINCT_WORKS === "off") return 0;
  for (const t of texts) {
    for (const s of (t ?? "").split(/[\n。]/)) {
      const m = PICK_EACH.exec(s);
      if (m) return NUM[m[1] ?? m[2]] ?? 0;
    }
  }
  return 0;
}

/** 작품을 하나씩 맡을 단계: "N차시"가 이름에 있는 단계를 차시 순서대로 n개(종합 단계는 뺀다). n개가 안 되면 빈 배열. */
export function workSteps(labels: string[], n: number): string[] {
  if (n < 2) return [];
  const picked = labels
    .filter((l) => !SUMMARY_STEP.test(l))
    .map((l) => ({ l, order: stepOrder(l) }))
    .filter((x) => x.order > 0)
    .sort((a, b) => a.order - b.order)
    .map((x) => x.l);
  return picked.length >= n ? picked.slice(0, n) : [];
}

/** 글에서 작품 제목(「」·〈〉·<>)을 나온 순서대로 중복 없이. 시집·책 제목(『』《》)은 작품이 아니라 뺀다. */
export function workTitles(texts: string[], limit = 6): string[] {
  const out: string[] = [];
  for (const t of texts) {
    for (const m of t.matchAll(/[「〈<]([^」〉>\n]{1,30})[」〉>]/g)) {
      const title = m[1].trim();
      if (title.length >= 1 && !out.includes(title)) out.push(title);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** 단계 이름 → 그 단계가 맡을 작품. 학생 지침의 작품을 먼저, 모자라면 조사 사실의 작품으로 채운다. 못 채우면 빈 맵. */
export function assignWorks(labels: string[], n: number, studentTexts: string[], factTexts: string[]): Map<string, string> {
  const steps = workSteps(labels, n);
  if (steps.length === 0) return new Map();
  const titles = workTitles([...studentTexts, ...factTexts], n);
  if (titles.length < n) return new Map();
  return new Map(steps.map((s, i) => [s, titles[i]]));
}

/** 그 단계 호출에 붙일 한 줄(맡은 작품이 없는 단계는 빈 글). */
export function distinctWorkLine(label: string, assignment: Map<string, string>): string {
  const mine = assignment.get(label);
  if (!mine) return "";
  const others = [...assignment.entries()].filter(([l]) => l !== label).map(([, w]) => `「${w}」`);
  return `작품: 안내문이 작품을 골라 차시마다 각각 수행하라고 했다. 이 단계에서 다룰 작품은 **「${mine}」 하나**다${others.length ? `(다른 차시는 ${others.join("·")}을 다루니 그 작품을 이 단계에서 감상하지 말 것)` : ""}.`;
}
