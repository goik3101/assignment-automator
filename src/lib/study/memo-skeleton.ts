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
  // 결과물이 "글의 목적·예상 독자·중심 내용…"처럼 이름 있는 항목으로 되어 있으면 항목마다 한 칸(+2칸)이 외우기 쉽다 — 칸마다 핵심어 수는 그대로라 외울 양은 칸 수만큼만 는다.
  return byItem ? { ...base, boxes: base.boxes + 2 } : base;
}

/** 모델이 준 뼈대를 믿을 수 있는 것만 남긴다: 핵심어가 한 줄 안에 실제로 있고 자료에도 나온 낱말이어야 한다. */
export function cleanSkeleton(
  raw: { box?: string; line?: string; keywords?: string[] }[] | undefined,
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
      .slice(0, limits.perBox);
    // 핵심어가 하나도 안 남은 칸(결론처럼 숫자·이름이 없는 칸)도 **순서에는 남긴다** — 칸 순서가 외울 것의 절반이다. 빈칸 문제만 이 칸을 건너뛴다.
    out.push({ box, line, keywords });
    if (out.length >= limits.boxes) break;
  }
  return out;
}

// ── 핵심어를 코드가 줄에서 뽑는다 ────────────────────────────────────────────
// 왜(2026-11-23 실측): 모델에게 "줄 안에 그대로 들어 있는 핵심어를 고르라"를 시켰더니 요약 한 번의 출력이 3,200~4,800토큰(추론 2,300~3,900)이었고,
// 핵심어를 빼자 1,900~2,400토큰·9초 안팎이 됐다(같은 결과물 3회씩). 핵심어는 모델이 잘 고르는 일이 아니라 **줄에서 규칙으로 뽑을 수 있는 일**이다:
// 연도·수치·조문 번호, 따옴표로 묶인 이름, 기관 이름, 개념 목록에 있는 말, 결과물에 여러 번 나오는 주제어. 줄에서 뽑으므로 항상 그 줄 안에 있다.
const GENERIC = new Set(['이용자', '사람', '경우', '사실', '내용', '때문', '과정', '상황', '방식', '관련', '중심', '필요', '가능성', '대응', '판단', '발표', '주제', '목적', '근거', '제시', '설명', '결과', '자료', '정리', '문제', '방법', '사례', '이후', '전체', '일부', '다른', '모든', '같은', '함께', '먼저', '마지막', '대신', '그러나', '하지만', '따라서', '여러', '이번', '다음', '앞서', '기존', '여부', '대안', '제안', '온라인', '오프라인', '인터넷', '게시물', '게시판', '사용자', '서비스', '시스템', '정보', '사회', '국가', '정부', '학생', '교육', '기술', '환경', '문화', '경제', '시간', '관계', '역할', '의미', '영향', '변화', '활동', '생각', '의견', '입장', '이유', '목표', '단계', '부분', '대상', '조건', '기준', '구분']);
const EN_COMMON = new Set(['The', 'This', 'That', 'It', 'These', 'Those', 'They', 'There', 'He', 'She', 'We', 'In', 'On', 'At', 'For', 'And', 'But', 'However', 'Then', 'Finally', 'First', 'Second', 'Third', 'Students', 'Student', 'People']);
const JOSA = /(으로서|으로써|으로|에서|에게|까지|부터|처럼|보다|이며|하고|이다|한다|된다|하는|되는|했다|였다|라는|이라는|과|와|은|는|이|가|을|를|의|에|도|로|만|며|고)$/;
const INSTITUTION = /(재판소|법원|위원회|연구원|연구소|협회|학회|재단|협약|조약|헌장)$/;
const VERB_END = /(?:하|되|르|으|리)면$|[다고며는하한된할]$/;
const NUMERIC = [
  /\d{4}년(?:\s*\d{1,2}월)?(?:\s*\d{1,2}일)?/g,
  /\d{1,2}월\s*\d{1,2}일/g,
  /제\s*\d+\s*조(?:\s*의\s*\d+)?/g,
  /\d[\d,.]*\s*(?:만|억|조|천)?\s*(?:%|퍼센트|명|개|곳|원|톤|kg|km|배|점|세|차|회|건|가지|시간|분|초|도|℃)/g,
];

function stem(word: string): string {
  let t = word.replace(/[.,!?“”‘’"'()]/g, "");
  for (let k = 0; k < 2; k++) {
    const m = JOSA.exec(t);
    if (!m || t.length - m[0].length < 2) break;
    t = t.slice(0, t.length - m[0].length);
  }
  return t;
}

/**
 * 한 줄에서 외울 핵심어를 뽑는다(위치 순). terms = 요약의 개념 목록(그 말이 줄에 있으면 핵심어).
 * 한국어 줄에서는 숫자·이름·기관·개념·반복 주제어를, 그 밖의 언어에서는 숫자·이름·개념만 뽑는다.
 */
export function deriveKeywords(line: string, material: string, terms: string[], perBox: number): string[] {
  const found: { s: string; at: number }[] = [];
  const add = (s: string, at: number) => {
    const t = s.trim();
    if (t && !found.some((f) => f.s === t)) found.push({ s: t, at });
  };
  for (const p of NUMERIC) for (const m of line.matchAll(p)) add(m[0], m.index ?? 0);
  for (const m of line.matchAll(/[『「“‘]([^』」”’]{2,15})[』」”’]/g)) add(m[1], m.index ?? 0);
  for (const t of terms) {
    const i = t.length >= 2 ? line.indexOf(t) : -1;
    if (i >= 0) add(t, i);
  }
  if (!/[가-힣]/.test(line)) {
    // 영어 줄: 연도·수치와 대문자로 시작하는 고유명사 덩어리(문장 첫 낱말 제외)
    for (const m of line.matchAll(/\b\d{4}\b|\b\d[\d,.]*\s*(?:%|percent|million|billion|thousand|km|kg)/gi)) add(m[0], m.index ?? 0);
    for (const m of line.matchAll(/(?<!^)(?<![.!?]\s)\b[A-Z][a-z]+(?:\s+(?:of\s+)?[A-Z][a-z]+)*\b/g)) {
      // 맨 앞의 흔한 낱말("The Constitutional Court"의 The)은 떼고 남은 고유명사만 쓴다.
      const ws = m[0].split(/\s+/);
      while (ws.length && EN_COMMON.has(ws[0])) ws.shift();
      if (ws.length) add(ws.join(" "), (m.index ?? 0) + m[0].indexOf(ws[0]));
    }
  }
  if (/[가-힣]/.test(line)) {
    const body = squash(material);
    const freq = (p: string) => body.split(squash(p)).length - 1;
    const words = line.split(/\s+/);
    let from = 0;
    const at = words.map((w) => {
      const i = line.indexOf(w, from);
      from = i + w.length;
      return i;
    });
    for (let i = 0; i < words.length; i++) {
      const st = stem(words[i]);
      if (INSTITUTION.test(st)) add(st, at[i]);
      for (let n = 2; n >= 1 && i + n <= words.length; n--) {
        const parts = words.slice(i, i + n).map((w, k) => (k === n - 1 ? stem(w) : w.replace(/[.,!?“”‘’"'()]/g, "")));
        const phrase = parts.join(" ");
        const sq = squash(phrase);
        if (sq.length < 3 || sq.length > 12 || !/[가-힣]/.test(sq)) continue;
        if (words.slice(i, i + n).some((w) => GENERIC.has(stem(w))) || parts.some((p) => VERB_END.test(p))) continue;
        // 조사를 못 벗겨 남은 꼴("안으로")도 뽑지 않는다.
        if (JOSA.test(parts[parts.length - 1])) continue;
        // 두 어절이면 앞 낱말은 조사 없이 명사로 끝나야 한다("본인 확인"은 되고 "신원을 확인"은 아니다). "표현의 자유"처럼 '의'로 이어진 것은 허용.
        if (n === 2 && /[은는이가을를에로와과도만]$/.test(parts[0])) continue;
        // 두 글자 낱말은 뽑지 않는다("밸브"는 개념 목록에 있으면 위에서 뽑힌다) — 두 글자까지 풀면 "나오"·"사용"·"과제" 같은 말이 섞였다(2026-11-23 실측).
        if (freq(phrase) >= 3) {
          add(phrase, at[i]);
          break;
        }
      }
    }
  }
  // 긴 것이 짧은 것을 품으면 짧은 것은 뺀다. 한 낱말이 너무 길면(조문 전체 이름 같은) 외울 핵심어로 쓰지 않는다.
  const pruned = found.filter((f) => squash(f.s).length <= (/[가-힣]/.test(f.s) ? 15 : 28) && !found.some((g) => g !== f && g.s.length > f.s.length && g.s.includes(f.s)));
  return pruned.sort((a, b) => a.at - b.at).slice(0, perBox).map((f) => f.s);
}

/**
 * 칸마다 뽑은 핵심어를 문서 전체에서 정리한다: 같은 낱말이 여러 칸의 줄에 나오면 **처음 나온 칸에만** 남기고(보기·빈칸이 겹치지 않게),
 * 칸의 절반 넘게 나오는 낱말은 글의 주제어라 핵심어에서 뺀다("인터넷 실명제"가 모든 칸의 빈칸이 되지 않게).
 */
export function dedupeKeywords(boxes: { line: string; keywords: string[] }[]): string[][] {
  const n = boxes.length;
  const theme = Math.max(3, Math.ceil(n * 0.6));
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
