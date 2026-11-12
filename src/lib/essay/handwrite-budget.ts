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
const IN_CLASS =
  /시험\s*대형|개별\s*평가|개별\s*작성|그\s*자리에서\s*작성|교실에서\s*작성|책상\s*간격|휴대폰\s*(?:사용\s*불가|걷)|부정\s*행위/;

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
  for (const m of text.matchAll(/(\d{1,3})\s*분/g)) {
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
