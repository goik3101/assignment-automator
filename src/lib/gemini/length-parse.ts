// 안내문의 분량 표현(글자수·단어수·발표 시간)을 숫자 범위로 바꾸는 순수 함수들. 숫자 계산을 모델에 맡기지 않는다.
export interface ParsedLength {
  min: number;
  max: number;
  unit?: "chars" | "words";
}

// 발표 시간 → 분량 환산(공백 포함 글자 수 / 영어 단어 수). 한국어 발표는 분당 약 270~330자, 중학생 수준 영어는 분당 약 100~130 words.
const CHARS_PER_MINUTE = { min: 270, max: 330 };
const WORDS_PER_MINUTE = { min: 100, max: 130 };

export function parseLengthConstraint(text: string, opts?: { english?: boolean }): ParsedLength | null {
  const t = text.trim();
  if (!t) return null;

  // 단어 수: "120~150 words" / "120-150단어" / "100 words 이상" / "150 words 내외" — 글자수 규칙보다 먼저 본다
  let w = t.match(/(\d{1,5})\s*[~\-∼–]\s*(\d{1,5})\s*(?:words?|단어)/i);
  if (w) {
    const a = Number(w[1]);
    const b = Number(w[2]);
    return { min: Math.min(a, b), max: Math.max(a, b), unit: "words" };
  }
  w = t.match(/(\d{1,5})\s*(?:words?|단어)\s*(이내|이하|이상|내외|정도|안팎)?/i);
  if (w) {
    const n = Number(w[1]);
    if (w[2] === "이내" || w[2] === "이하") return { min: 0, max: n, unit: "words" };
    if (w[2] === "이상") return { min: n, max: 0, unit: "words" };
    const tol = Math.round(n * 0.1);
    return { min: Math.max(0, n - tol), max: n + tol, unit: "words" };
  }

  const chars = parseCharLength(t);
  if (chars) return chars;

  // 발표 시간만 적힌 경우("약 3분 분량"): 분당 분량으로 환산한다
  const mm = t.match(/(\d{1,3}(?:\.\d+)?)\s*분/);
  if (mm) {
    const minutes = Number(mm[1]);
    if (minutes > 0 && minutes <= 30) {
      const r = opts?.english ? WORDS_PER_MINUTE : CHARS_PER_MINUTE;
      return { min: Math.round(minutes * r.min), max: Math.round(minutes * r.max), unit: opts?.english ? "words" : undefined };
    }
  }
  return null;
}

function parseCharLength(t: string): { min: number; max: number } | null {

  // "500~600자" / "500-600자" / "500∼600자"
  let m = t.match(/(\d{1,6})\s*[~\-∼]\s*(\d{1,6})\s*자/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }

  // "800자 내외 (±50자 허용)" / "800자 내외 ±50자"
  m = t.match(/(\d{1,6})\s*자\s*내외[^0-9]{0,10}[±+\-]\s*(\d{1,6})\s*자/);
  if (m) {
    const target = Number(m[1]);
    const tolerance = Number(m[2]);
    return { min: Math.max(0, target - tolerance), max: target + tolerance };
  }

  // "800자 이상 1000자 이하" / "800자 이상, 1000자 이내" — 하한과 상한이 함께 적힌 경우는 둘 다 반영한다
  const lo = t.match(/(\d{1,6})\s*자\s*이상/);
  const hi = t.match(/(\d{1,6})\s*자\s*(?:이내|이하)/);
  if (lo && hi) return { min: Number(lo[1]), max: Number(hi[1]) };

  // "800자 이내" / "800자 이하"
  m = t.match(/(\d{1,6})\s*자\s*(이내|이하)/);
  if (m) return { min: 0, max: Number(m[1]) };

  // "800자 이상"
  m = t.match(/(\d{1,6})\s*자\s*이상/);
  if (m) return { min: Number(m[1]), max: 0 };

  // "800자 내외" / "800자 정도" / "800자 가량" (명시적 허용치 없음) → ±10%
  m = t.match(/(\d{1,6})\s*자\s*(내외|정도|가량)/);
  if (m) {
    const target = Number(m[1]);
    const tolerance = Math.round(target * 0.1);
    return { min: Math.max(0, target - tolerance), max: target + tolerance };
  }

  // 그 외 "800자"처럼 숫자+자만 있는 경우도 같은 방식으로 처리
  m = t.match(/(\d{1,6})\s*자/);
  if (m) {
    const target = Number(m[1]);
    const tolerance = Math.round(target * 0.1);
    return { min: Math.max(0, target - tolerance), max: target + tolerance };
  }

  return null;
}

/**
 * 안내문 전체에 걸리는 분량("전체 1500자 내외")을 분석기가 모든 단계에 똑같이 복사해 넣으면(프롬프트가 그렇게 시킨다), 단계마다 1500자를 쓰게 되어
 * 결과가 단계 수배로 부풀고 재시도가 폭주한다(실측: 7개 단계 × 1350~1650자 재시도). 같은 표현이 2개 이상 단계에 복사돼 있고 "각각/단계별"이 아니면
 * 전체 분량으로 보고 단계 수로 나눠 배분한다. 단계별 분량이 서로 다른 안내문(1차시 200자, 2차시 800자)은 건드리지 않는다.
 */
export function distributeSharedLength<T extends { target_length?: ParsedLength & { counts_spaces: boolean }; _lengthText?: string }>(
  elements: T[]
): Omit<T, "_lengthText">[] {
  const groups = new Map<string, number[]>();
  elements.forEach((e, i) => {
    const key = e._lengthText?.replace(/\s+/g, "");
    if (!e.target_length || !key) return;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  const out = elements.map((e) => ({ ...e }));
  for (const [key, idxs] of groups) {
    if (idxs.length < 2 || /각각|각\s?단계|단계별|항목별|마다|각\s?\d/.test(key)) continue;
    // 하한만/상한만 있는 값("200자 이상")은 단계별 기준일 가능성이 커서 나누지 않는다. 범위("1500자 내외")만 전체 분량으로 본다.
    if (idxs.some((i) => !(out[i].target_length!.min > 0 && out[i].target_length!.max > 0))) continue;
    for (const i of idxs) {
      const tl = out[i].target_length!;
      out[i].target_length = {
        ...tl,
        min: tl.min > 0 ? Math.max(1, Math.round(tl.min / idxs.length)) : 0,
        max: tl.max > 0 ? Math.round(tl.max / idxs.length) : 0,
      };
    }
  }
  return out.map((e) => {
    const { _lengthText, ...rest } = e;
    void _lengthText;
    return rest;
  });
}
