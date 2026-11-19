// **그 자리에서 손으로 쓰는 평가**는 알맞은 분량이 채점표가 아니라 **쓸 수 있는 시간**에서 나온다.
//
// 왜(2026-11-12, 사용자 실사용): 과학 수행평가를 실제로 써 보고 "글이 쓰기에 너무 길어서 적합하지 않다"고 했다.
// 그 과제는 안내문이 "2차시는 개별 평가", "미리 시험 대형으로 책상 간격을 띄우기"라고 적은 **교실에서 손으로
// 쓰는 평가**다. 우리는 그걸 한 번도 보지 않고 역할 표(보고서 = 960~1,800자)로만 분량을 정했고,
// 탐구보고서가 2,181자로 나왔다 — 40~50분 안에 손으로 옮겨 적을 수 없는 양이다.
//
// 기준: 중고생 손글씨 **분당 약 30자**. 40분이면 1,200자, 45분(한 차시)이면 1,350자.
// 이 값이 채점 데이터와 맞는다 — 과학 만점 탐구보고서 실측이 **1,307~1,501자**이고(한 차시 개별 평가),
// 40분을 못 박은 사회 인권저널 신문의 만점 칸 합이 약 1,350자다. 즉 선생님이 시간을 정할 때
// 이미 "손으로 쓸 수 있는 양"을 정한 것이고, 우리는 그 숫자를 읽기만 하면 됐다.
//
// **발표 시간과 섞지 말 것** — 국어 발표 안내문의 "2분 30초~3분"은 말하는 시간이다. 그래서 관문은
// "그 자리에서 쓴다"는 신호(시험 대형·개별 평가·휴대폰 수거 등)를 먼저 요구하고, 10분 미만은 버린다.
//
// alias import 없음 — node:test에서 바로 불러옴.

/** 교실에서 그 자리에서 손으로 쓰는 평가라는 신호. */
// 2026-11-15 역사 신문(손글씨 안내 B4용지): 이 목록에 "수행평가 시간을 할애하여 그리면 인정"·"수행평가 당일"·"디지털 기기는 지참 불가"·"손글씨"가 없어
// 관문이 **한 번도 안 열렸고** 위의 "칸이 한 지면을 나눠 쓴다"는 분량 나눔도 같이 꺼져 있었다 — 결과물이 3,250~3,600자(손으로 쓸 수 있는 양의 2.5배)였다.
// 같은 조건을 선생님마다 다른 말로 적으므로 "그 자리에서 손으로 쓴다"를 뜻하는 말을 넓게 잡는다(rule-audit.ts "손글씨평가").
const IN_CLASS =
  /시험\s*대형|개별\s*평가|개별\s*작성|그\s*자리에서\s*작성|교실에서\s*작성|책상\s*간격|휴대폰\s*(?:사용\s*불가|걷)|부정\s*행위|수행평가\s*(?:당일|시간)|평가\s*시간\s*(?:을|에|중)|디지털\s*기기[^.\n]{0,12}(?:불가|금지|못)|손글씨|(?:\d|첫|두|세)\s*번째\s*시간|\d\s*교시|한\s*차시|\d{1,3}\s*분[^\n.0-9]{0,8}(?:작성|쓰기|쓰고|씀|기록)|(?:작성|쓰기|기록)\s*(?:시간)?\s*[(:：|]?\s*\d{1,3}\s*분/;
// 마지막 두 갈래(2026-11-19): **쓰는 시간을 분으로 적은 것 자체가 신호**다("작성(50분)", "20분 | 시험지 작성", "25분 쓰고").
// 책 처방전 안내문은 시험 대형·부정행위·손글씨 같은 낱말이 하나도 없는데 차시마다 쓰는 시간을 적어 관문이 닫힌 채였다.
// 발표 시간("발표 5분")은 쓰는 말이 붙지 않아 걸리지 않고, 10분 미만 숫자는 아래에서 버린다.

/** 한 차시(교시)의 기본 길이. */
const PERIOD_MINUTES = 45;
/** 중고생 손글씨 속도(자/분). 보수적으로 잡는다 — 넘치는 쪽이 학생에게 더 해롭다. */
export const CHARS_PER_MINUTE = 30;
const MIN_CHARS = 600;
const MAX_CHARS = 2000;

export interface HandwriteBudget {
  minutes: number;
  chars: number;
  /** 사람이 읽는 근거(프롬프트·로그용) */
  basis: string;
}

/** 안내문이 못 박은 "쓰는 시간"(분). 없으면 null. */
function statedMinutes(text: string): { minutes: number; basis: string } | null {
  // "평가 시간: 시작부터 40분 부여함", "40분 이내" — 10분 미만은 발표·준비 시간이므로 버린다.
  // 쓰는 시간이 분명한 숫자가 있으면 그것이 먼저다("25분 쓰고") — 첫 숫자는 "제비뽑기 10분"일 수 있다(2026-11-19 책 처방전).
  const writing = /(\d{1,3})\s*분[^\n.0-9]{0,8}(?:작성|쓰기|쓰고|씀|기록)/.exec(text);
  if (writing && Number(writing[1]) >= 10 && Number(writing[1]) <= 180) return { minutes: Number(writing[1]), basis: `안내문이 적은 ${writing[1]}분` };
  for (const m of text.matchAll(/(\d{1,3})\s*분/g)) {
    const before = text.slice(Math.max(0, m.index! - 6), m.index!);
    if (/제비뽑기|발표|준비|설명|토론|토의|뽑기/.test(before)) continue;
    const n = Number(m[1]);
    if (n >= 10 && n <= 180) return { minutes: n, basis: `안내문이 적은 ${n}분` };
  }
  // "1시간", "2시간"
  const h = /(\d)\s*시간(?!\s*표)/.exec(text);
  if (h) {
    const n = Number(h[1]) * 60;
    if (n >= 30 && n <= 180) return { minutes: n, basis: `안내문이 적은 ${h[1]}시간` };
  }
  return null;
}

/**
 * 이 과제가 교실에서 손으로 쓰는 평가면, **한 단계가 쓸 수 있는 글자 수**를 돌려준다.
 * 아니면 null(분량은 예전처럼 역할 표가 정한다).
 */
export function handwriteBudget(texts: (string | undefined)[]): HandwriteBudget | null {
  const joined = texts.filter(Boolean).join("\n");
  if (!IN_CLASS.test(joined)) return null;
  const stated = statedMinutes(joined);
  const minutes = stated?.minutes ?? PERIOD_MINUTES;
  const basis = stated ? stated.basis : "한 차시(약 45분)";
  const chars = Math.min(MAX_CHARS, Math.max(MIN_CHARS, minutes * CHARS_PER_MINUTE));
  return { minutes, chars, basis: `${basis} × 손글씨 분당 ${CHARS_PER_MINUTE}자` };
}

// ── 차시마다 시간이 다른 안내문 ───────────────────────────────────────────────────────────────
// 2026-11-19 사용자 개선 요청(공통국어 책 처방전: 1차시 25분 · 2차시 25분 쓰기 · 3차시 한 시간 · 4차시 30분간 손편지):
// 위 관문은 "시험 대형·부정행위·손글씨" 같은 **그 자리에서 쓴다는 신호**가 있어야 열리는데 이 안내문에는 한 낱말도 없어 **닫힌 채**였고
// (`활동 시간 : … 약 25분 가량`이 신호가 아니었다), 열렸어도 `statedMinutes`가 글 전체에서 **첫 숫자**(25분)를 모든 단계에 썼다.
// 그래서 30분 손편지가 계획 800~1,600자로 나와 학생이 30분에 쓸 수 있는 양(≈900자)보다 길었다.
// 해법: 안내문 전사를 "N차시 …" 구역으로 나눠 **단계마다 그 구역의 "활동 시간"**을 읽는다. 구역 이름이 단계 이름과 닮은 것을 고른다.

export interface NoticeSection {
  title: string;
  body: string;
}

/** 전사를 "1차시 고민쓰기"처럼 차시 머리줄에서 나눈다. 머리줄이 둘 미만이면 빈 배열(차시 구분이 없는 안내문). */
export function noticeSections(notice: string | undefined): NoticeSection[] {
  const lines = (notice ?? "").split(/\r?\n/);
  const out: NoticeSection[] = [];
  for (const line of lines) {
    const m = /^\s*(\d{1,2})\s*차시\s*[:.)]?\s*(.*)$/.exec(line);
    if (m && !/활동\s*시간/.test(line)) out.push({ title: m[2].trim(), body: "" });
    else if (out.length > 0) out[out.length - 1].body += line + "\n";
  }
  return out.length >= 2 ? out : [];
}

const bigrams = (s: string): Set<string> => {
  const t = s.replace(/[^0-9A-Za-z가-힣]/g, "");
  const g = new Set<string>();
  for (let i = 0; i + 1 < t.length; i++) g.add(t.slice(i, i + 2));
  return g;
};
const dice = (a: string, b: string): number => {
  const x = bigrams(a);
  const y = bigrams(b);
  if (x.size === 0 || y.size === 0) return 0;
  let n = 0;
  for (const g of x) if (y.has(g)) n++;
  return (2 * n) / (x.size + y.size);
};

/** 구역의 "활동 시간" 줄에서 **쓰는 시간**(분)을 읽는다. 말하기·발표·토론 활동이면 읽지 않는다(그 시간은 쓰는 시간이 아니다). */
export function sectionWritingMinutes(body: string): number | null {
  const content = /활동\s*내용\s*[:：]?([^\n]*)/.exec(body)?.[1] ?? "";
  if (/발표|말하기|토론|토의|면담|인터뷰|듣기/.test(content) && !/쓰|작성|적/.test(content)) return null;
  const line = /활동\s*시간\s*[:：]?([^\n]*)/.exec(body)?.[1];
  if (!line) return null;
  const ok = (n: number) => (n >= 10 && n <= 180 ? n : null);
  const w = /(\d{1,3})\s*분\s*(?:가량|정도)?\s*(?:동안\s*)?(?:쓰|작성)/.exec(line);
  if (w) return ok(Number(w[1]));
  const h = /(?:(\d)|한)\s*시간/.exec(line);
  if (h) return ok((h[1] ? Number(h[1]) : 1) * 60);
  for (const m of line.matchAll(/(\d{1,3})\s*분/g)) {
    const before = line.slice(Math.max(0, m.index! - 6), m.index!);
    if (/제비뽑기|발표|준비|설명|토론|토의|뽑기/.test(before)) continue;
    const n = ok(Number(m[1]));
    if (n) return n;
  }
  return null;
}

const LINE_WRITE_MIN = [/(\d{1,3})\s*분[^\n.0-9]{0,8}(?:작성|쓰기|쓰고|씀|기록)/g, /(?:작성|쓰기|기록)\s*(?:시간)?\s*[(:：|]?\s*(\d{1,3})\s*분/g];

/**
 * 차시 머리줄이 없는 안내문("1) 예비 보고서 작성(50분) … 2) 실험 보고서 작성(100분)")에서 **그 단계 이름과 닮은 줄**의 쓰는 시간을 읽는다.
 * 줄이 단계 이름과 닮지 않으면(Dice 0.3 미만) null — 모든 단계에 첫 숫자를 쓰는 예전 관문이 맡는다.
 */
function stepLineBudget(step: { label: string }, notice: string | undefined): HandwriteBudget | null {
  let best: { minutes: number; line: string; score: number } | null = null;
  for (const raw of (notice ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let minutes: number | null = null;
    for (const re of LINE_WRITE_MIN) {
      for (const m of line.matchAll(re)) {
        const n = Number(m[1]);
        if (n >= 10 && n <= 180) minutes = n;
      }
    }
    if (!minutes) continue;
    const score = dice(step.label, line);
    if (score >= 0.3 && (!best || score > best.score)) best = { minutes, line, score };
  }
  if (!best) return null;
  const chars = Math.min(MAX_CHARS, Math.max(MIN_CHARS, best.minutes * CHARS_PER_MINUTE));
  return { minutes: best.minutes, chars, basis: `안내문이 "${best.line.slice(0, 24)}"에 적은 ${best.minutes}분 × 손글씨 분당 ${CHARS_PER_MINUTE}자` };
}

/**
 * 이 단계가 속한 차시 구역에 **쓰는 시간이 적혀 있으면** 그 시간으로 손글씨 예산을 낸다. 없으면 null — 호출하는 쪽이 예전 관문을 쓴다.
 * 구역 이름과 단계 이름이 닮지 않으면(Dice 0.3 미만) 단계 수와 구역 수가 같을 때만 순서로 짝짓는다.
 */
export function stepHandwriteBudget(
  step: { label: string; description?: string },
  notice: string | undefined,
  stepIndex = -1,
  stepCount = -1
): HandwriteBudget | null {
  const secs = noticeSections(notice);
  if (secs.length === 0) return stepLineBudget(step, notice);
  let best = -1;
  let bestScore = 0;
  secs.forEach((s, i) => {
    const sc = dice(step.label, s.title);
    if (sc > bestScore) {
      bestScore = sc;
      best = i;
    }
  });
  if (bestScore < 0.3) best = stepIndex >= 0 && stepCount === secs.length ? stepIndex : -1;
  if (best < 0) return stepLineBudget(step, notice);
  const minutes = sectionWritingMinutes(secs[best].body);
  if (!minutes) return stepLineBudget(step, notice);
  const chars = Math.min(MAX_CHARS, Math.max(MIN_CHARS, minutes * CHARS_PER_MINUTE));
  return { minutes, chars, basis: `안내문이 "${secs[best].title}"에 적은 ${minutes}분 × 손글씨 분당 ${CHARS_PER_MINUTE}자` };
}

/** 역할 표가 정한 범위를 쓸 수 있는 시간으로 좁힌다(넓히지는 않는다). */
export function clampToHandwrite(
  range: { min: number; max: number },
  budget: HandwriteBudget | null
): { min: number; max: number; clamped: boolean } {
  if (!budget) return { ...range, clamped: false };
  if (range.max <= budget.chars) return { ...range, clamped: false };
  const max = budget.chars;
  // 바닥이 천장을 넘어서면 바닥도 함께 내린다(범위가 뒤집히면 프롬프트가 모순을 말한다).
  const min = Math.min(range.min, Math.round(max * 0.75));
  return { min, max, clamped: true };
}
