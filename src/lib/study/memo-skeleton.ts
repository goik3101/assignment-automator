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
export function skeletonLimits(detail: SkeletonDetail, chars?: number, byItem = false): { boxes: number; perBox: number } {
  const base = { brief: { boxes: 4, perBox: 2 }, standard: { boxes: 6, perBox: 3 }, detailed: { boxes: 8, perBox: 4 } }[detail];
  if (chars && chars < 800) return { boxes: Math.min(base.boxes, 4), perBox: Math.min(base.perBox, 2) };
  // 결과물이 "글의 목적·예상 독자·중심 내용…"처럼 이름 있는 항목으로 되어 있으면 항목마다 한 칸이 외우기 쉽다. 6칸 한도로는 항목이 합쳐져 요약이 두세 줄이 됐다(2026-11-25) → 2배.
  return byItem ? { ...base, boxes: base.boxes * 2 } : base;
}

/** 모델이 준 뼈대를 믿을 수 있는 것만 남긴다: 핵심어가 한 줄 안에 실제로 있고 자료에도 나온 낱말이어야 한다. */
export function cleanSkeleton(
  raw: { box?: string; line?: string; keywords?: string[]; maxKeywords?: number }[] | undefined,
  material: string,
  limits: { boxes: number; perBox: number },
  /** false면 "핵심어가 자료에 나온 낱말인가" 검사를 건너뛴다 — 영어 화면은 용어를 영어로 써서 한국어 자료에 없다(그 검사 때문에 영어에서는 핵심어가 전부 버려졌다). */
  opts: { checkMaterial?: boolean } = {}
): SkeletonBox[] {
  const checkMaterial = opts.checkMaterial !== false;
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
        // 한 글자 낱말("물")은 어디에나 있어 채점이 무의미하다(숫자는 허용). 줄에는 **글자 그대로** 있어야 가리기가 된다.
        if (sq.length < 2 && !/\d/.test(sq)) return false;
        if (seen.has(sq) || !line.includes(k) || !lineSq.includes(sq) || (checkMaterial && !body.includes(sq))) return false;
        seen.add(sq);
        return true;
      })
      .slice(0, r.maxKeywords ?? limits.perBox);
    // 핵심어가 하나도 안 남은 칸(결론처럼 숫자·이름이 없는 칸)도 **순서에는 남긴다** — 칸 순서가 외울 것의 절반이다. 빈칸 문제만 이 칸을 건너뛴다.
    out.push({ box, line, keywords });
    if (out.length >= limits.boxes) break;
  }
  return out;
}

// ── 핵심어: 모델이 줄 안에서 「」로 표시하고, 코드가 표시·숫자·개념어를 모은다 ─────────
// 변천(2026-11-23~25): ① 모델에게 줄과 별도로 keywords 배열을 고르게 했더니 줄 안에 "그대로" 들어 있어야 한다는 제약 때문에 출력이 두 배(3.2~4.8k토큰)였다.
// ② 코드가 줄에서 전부 추정하게 했더니(기관 이름·반복 주제어·조사 벗기기) 가벼웠지만 과학-02에서 "스프레"(스프레이)·"커지면"·"올라오" 같은 잘린 말과 동사가 섞였다.
// ③ 지금: 줄을 쓰는 김에 외울 말에 「」만 씌우게 하고(추가 추론이 거의 없다), 코드는 그 표시와 연도·수치·조문·개념 목록의 말만 모은다 — 추정 규칙(약 70줄)은 지웠다.
const NUMERIC = [
  /\d{4}년(?:\s*\d{1,2}월)?(?:\s*\d{1,2}일)?/g,
  /\d{1,2}월\s*\d{1,2}일/g,
  /제\s*\d+\s*조(?:\s*의\s*\d+)?/g,
  /\d[\d,.]*\s*(?:만|억|조|천)?\s*(?:%|퍼센트|명|개|곳|원|톤|kg|km|배|점|세|차|회|건|가지|시간|분|초|도|℃)/g,
];

/**
 * 모델이 쓴 줄에서 「표시」를 걷어 깨끗한 줄과 핵심어를 만든다(위치 순, perBox개까지).
 * 핵심어 = 「」로 표시한 말 + 줄 안의 연도·수치·조문 + 개념 목록(terms)에 있는 말. 너무 긴 표시(문장째)나 한 글자 표시는 버린다.
 */
export function markKeywords(rawLine: string, terms: string[], perBox: number): { line: string; keywords: string[] } {
  let line = "";
  const found: { s: string; at: number }[] = [];
  const add = (s: string, at: number) => {
    const t = s.trim();
    if (t && !found.some((f) => f.s === t)) found.push({ s: t, at });
  };
  let open = -1;
  const marked: { s: string; at: number }[] = [];
  for (const ch of rawLine ?? "") {
    if (ch === "「") open = line.length;
    else if (ch === "」") {
      if (open >= 0) marked.push({ s: line.slice(open), at: open });
      open = -1;
    } else line += ch;
  }
  for (const m of marked) {
    const sq = squash(m.s);
    if (sq.length > (/[가-힣]/.test(sq) ? 15 : 28) || (sq.length < 2 && !/\d/.test(sq))) continue;
    add(m.s, m.at);
  }
  for (const p of NUMERIC) for (const m of line.matchAll(p)) add(m[0], m.index ?? 0);
  for (const t of terms) {
    const i = t.length >= 2 && squash(t).length <= (/[가-힣]/.test(t) ? 15 : 28) ? line.indexOf(t) : -1;
    if (i >= 0) add(t, i);
  }
  // 긴 것이 짧은 것을 품으면 짧은 것은 뺀다("몽고메리 버스 보이콧"이 있으면 "버스 보이콧"은 뺀다).
  const pruned = found.filter((f) => !found.some((g) => g !== f && g.s.length > f.s.length && g.s.includes(f.s)));
  return { line: line.trim(), keywords: pruned.sort((x, y) => x.at - y.at).slice(0, perBox).map((f) => f.s) };
}

/**
 * 칸마다 뽑은 핵심어를 문서 전체에서 정리한다: 같은 낱말이 여러 칸의 줄에 나오면 **처음 나온 칸에만** 남기고(보기·빈칸이 겹치지 않게),
 * 칸의 40% 넘게 나오는 낱말은 글의 주제어라 핵심어에서 뺀다("인터넷 실명제"가 모든 칸의 빈칸이 되지 않게).
 */
export function dedupeKeywords(boxes: { line: string; keywords: string[] }[]): string[][] {
  const n = boxes.length;
  const theme = Math.max(3, Math.ceil(n * 0.4));
  const claimed = new Set<string>();
  return boxes.map((b) =>
    b.keywords.filter((k) => {
      const spread = boxes.filter((x) => x.line.includes(k)).length;
      if (n >= 4 && spread >= theme) return false;
      if (claimed.has(k)) return false;
      claimed.add(k);
      return true;
    })
  );
}

/** 두음 암기 보조: 숫자로 시작하는 핵심어는 두음이 의미가 없어("1964·1965") 뺀다. 남은 핵심어가 둘 미만이면 없음. */
export function mnemonicOf(keywords: string[]): string | null {
  const words = keywords.filter((k) => !/^\d/.test(k.trim()));
  return words.length >= 2 ? acronym(words) : null;
}

/** 빈칸 문제가 되는(핵심어가 있는) 칸 번호들. */
export const quizIndexes = (boxes: SkeletonBox[]) => boxes.flatMap((b, i) => (b.keywords.length > 0 ? [i] : []));

/** 칸 순서를 한 줄 흐름으로: 실험1 → 실험2 → 샴푸 → 스프레이. */
export const flowLine = (boxes: SkeletonBox[]) => boxes.map((b) => b.box).join(" → ");

/** 두음 암기: 핵심어 첫 글자를 이어 붙인다. 예) 대기압·밸브·펌프 → "대·밸·펌". */
export const acronym = (keywords: string[]) => keywords.map((k) => leadToken(k)).join("·");

/** 두음·힌트의 첫 조각: 보통은 첫 글자, 숫자로 시작하면 앞의 숫자 덩어리("2022년"→"2022")라야 서로 구별된다. */
function leadToken(keyword: string): string {
  const k = keyword.trim();
  const num = /^\d[\d.,]*/.exec(k);
  return num ? num[0] : (Array.from(k)[0] ?? "");
}

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
  const k = keyword.trim();
  const lead = leadToken(k);
  const rest = Array.from(k).length - Array.from(lead).length;
  return rest <= 0 ? lead : lead + "○".repeat(rest);
}

// 채점 비교는 소수점·하이픈·퍼센트를 지우지 않는다 — "3.5%"와 "35%", "2-3"과 "23"이 같은 답이 되면 수치 암기가 무의미하다.
const norm = (s: string) => s.replace(/[\s·・,()「」『』"'“”‘’:]/g, "").toLowerCase();

/**
 * 입력이 핵심어를 썼는가(띄어쓰기·구두점·대소문자 무시). **핵심어가 입력 안에 들어 있으면 맞다** — "대기압이"·"771만 톤이다"처럼 조사를 붙여 써도 맞게 본다
 * (백지 연습의 scoreWrite와 같은 기준. 예전에는 글자가 똑같아야 해서 첫 글자 쓰기만 따로 엄격했다).
 */
export const sameKeyword = (input: string, keyword: string) => norm(keyword).length > 0 && norm(input).includes(norm(keyword)) && norm(input).length <= norm(keyword).length + 6;

/** 보기(칩) 고르기용: 글자가 똑같아야 한다(보기 안에 정답이 부분 문자열로 든 오답을 정답으로 보지 않게). */
export const sameWord = (a: string, b: string) => norm(a) === norm(b) && norm(a).length > 0;

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
