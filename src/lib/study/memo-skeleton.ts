// **암기 뼈대**: 시험장에서 문장은 즉석에서 쓸 수 있으니, 외울 것은 "못 쓰는 것"뿐이다 — 칸 순서와 칸마다의 핵심어(이름·용어·수치·연도·결론 방향).
// 모델은 요약 한 번에 뼈대(칸 이름·한 줄·핵심어)만 만들고, 가리기·힌트·채점·두음은 전부 이 파일의 코드가 한다(추가 모델 호출 0).
// alias import 없음 — node:test에서 바로 불러옴.

export interface SkeletonBox {
  /** 칸 이름(안내문의 칸, 없으면 결과물의 큰 덩어리 이름) */
  box: string;
  /** 그 칸에서 말할 핵심을 한 문장으로. 핵심어가 그대로 들어 있다. */
  line: string;
  /** 외울 핵심어(자료에 나온 표기 그대로, `line`에 들어 있는 것만) */
  keywords: string[];
}

export type SkeletonDetail = "brief" | "standard" | "detailed";

const squash = (s: string) => s.replace(/[\s·・,.()「」『』"'“”‘’\-–—:]/g, "");

/**
 * 외울 양의 상한. 손으로 쓰는 시험이면 쓸 수 있는 글자 수(chars)에 맞춰 줄인다 —
 * 1,350자짜리 시험에 핵심어 20개를 외우게 할 이유가 없다. 숫자는 처음 값이고 실사용 평가로 조정한다.
 */
export function skeletonLimits(detail: SkeletonDetail, chars?: number): { boxes: number; perBox: number } {
  const base = { brief: { boxes: 4, perBox: 2 }, standard: { boxes: 6, perBox: 3 }, detailed: { boxes: 8, perBox: 4 } }[detail];
  if (chars && chars < 800) return { boxes: Math.min(base.boxes, 4), perBox: Math.min(base.perBox, 2) };
  return base;
}

/** 모델이 준 뼈대를 믿을 수 있는 것만 남긴다: 핵심어가 한 줄 안에 실제로 있고 자료에도 나온 낱말이어야 한다. */
export function cleanSkeleton(
  raw: { box?: string; line?: string; keywords?: string[] }[] | undefined,
  material: string,
  limits: { boxes: number; perBox: number }
): SkeletonBox[] {
  const body = squash(material);
  const out: SkeletonBox[] = [];
  for (const r of raw ?? []) {
    const box = r.box?.trim();
    const line = r.line?.trim();
    if (!box || !line) continue;
    const lineSq = squash(line);
    const seen = new Set<string>();
    const keywords = (r.keywords ?? [])
      .map((k) => k?.trim() ?? "")
      .filter((k) => {
        const sq = squash(k);
        if (sq.length < 1 || seen.has(sq)) return false;
        if (!lineSq.includes(sq) || !body.includes(sq)) return false;
        seen.add(sq);
        return true;
      })
      .slice(0, limits.perBox);
    if (keywords.length === 0) continue;
    out.push({ box, line, keywords });
    if (out.length >= limits.boxes) break;
  }
  return out;
}

/** 칸 순서를 한 줄 흐름으로: 실험1 → 실험2 → 샴푸 → 스프레이. */
export const flowLine = (boxes: SkeletonBox[]) => boxes.map((b) => b.box).join(" → ");

/** 두음 암기: 핵심어 첫 글자를 이어 붙인다. 예) 대기압·밸브·펌프 → "대·밸·펌". */
export const acronym = (keywords: string[]) => keywords.map((k) => Array.from(k.trim())[0] ?? "").join("·");

export interface LineSegment {
  text: string;
  /** 이 조각이 가려진 핵심어이면 keywords에서의 순번 */
  blank?: number;
}

/** 한 줄을 핵심어 자리에서 잘라 [글, 빈칸, 글…]로 만든다. 같은 핵심어가 여러 번 나오면 첫 번째만 가린다. */
export function segmentLine(line: string, keywords: string[]): LineSegment[] {
  const hits = keywords
    .map((k, i) => ({ k, i, at: line.indexOf(k) }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => a.at - b.at);
  const segs: LineSegment[] = [];
  let cur = 0;
  for (const h of hits) {
    if (h.at < cur) continue; // 겹친 핵심어는 앞의 것만
    if (h.at > cur) segs.push({ text: line.slice(cur, h.at) });
    segs.push({ text: h.k, blank: h.i });
    cur = h.at + h.k.length;
  }
  if (cur < line.length) segs.push({ text: line.slice(cur) });
  return segs;
}

/** 고르기 보기: 이 칸의 핵심어 + 다른 칸의 핵심어 몇 개를 오답으로 섞는다. 같은 입력이면 같은 결과(화면이 흔들리지 않게). */
export function chipBank(boxes: SkeletonBox[], index: number, distractors = 2): string[] {
  const own = boxes[index].keywords;
  const others: string[] = [];
  for (let step = 1; step < boxes.length && others.length < distractors; step++) {
    for (const k of boxes[(index + step) % boxes.length].keywords) {
      if (!own.includes(k) && !others.includes(k)) others.push(k);
      if (others.length >= distractors) break;
    }
  }
  const all = [...own, ...others];
  // 정답 순서가 그대로 드러나지 않게 고정 규칙으로 섞는다.
  return all.map((k, i) => ({ k, s: (squash(k).length * 7 + i * 5 + index * 3) % 11 })).sort((a, b) => a.s - b.s || a.k.localeCompare(b.k)).map((x) => x.k);
}

/** 첫 글자 힌트: "대기압" → "대○○". */
export function firstLetterHint(keyword: string): string {
  const chars = Array.from(keyword.trim());
  return chars.length <= 1 ? chars.join("") : chars[0] + "○".repeat(chars.length - 1);
}

const norm = (s: string) => squash(s).toLowerCase();

/** 입력이 핵심어와 같은 말로 볼 수 있는가(띄어쓰기·구두점·대소문자 무시). */
export const sameKeyword = (input: string, keyword: string) => norm(input) === norm(keyword) && norm(keyword).length > 0;

/** 백지 답안에서 핵심어가 몇 개 들어 있는지. 글 전체를 보므로 어디에 썼든 인정한다. */
export function scoreWrite(text: string, keywords: string[]): { hit: string[]; miss: string[] } {
  const t = norm(text);
  const hit: string[] = [];
  const miss: string[] = [];
  for (const k of keywords) (t.includes(norm(k)) ? hit : miss).push(k);
  return { hit, miss };
}

/** 준비도(%): 백지 단계에서 **처음 쓴 답**의 핵심어 적중률. 우리가 정한 핵심어 기준의 추정이지 실제 채점이 아니다. */
export function readiness(results: { hit: number; total: number }[]): number {
  const total = results.reduce((s, r) => s + r.total, 0);
  if (total === 0) return 0;
  return Math.round((results.reduce((s, r) => s + r.hit, 0) / total) * 100);
}
