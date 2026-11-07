// 안내문의 "A4 1장 이내"·"원고지 5매"·"1~2쪽"·"한 페이지"를 글자 수 범위로 환산한다. alias import 없음(node:test에서 바로 불러옴).
//
// 왜: 글자 수·단어 수·발표 시간·줄 수만 읽어서, 학교 안내문에 흔한 "쪽/장/매" 분량은 통째로 "분량 지시 없음"이 됐다
// (2026-11-06 점검: 22개 표현 중 A4 1장·원고지 5매·1~2쪽·한 페이지 등 전부 못 읽음). 그 단계에는 역할별 기본 범위가 붙는다.
// 환산값은 추정이다 — 그래서 경고·재시도 경로(target_length)에는 넣지 않고 프롬프트 가이드로만 쓴다(거짓 "분량 미달" 경고 방지).
// LINE_LENGTH=on일 때만 쓴다(호출하는 쪽이 확인).

/** 공백 포함 글자 수 환산: A4 한 쪽(10~11pt, 줄 간격 160% 기본) ≈ 1,000자, 원고지 한 매 = 200자. */
export const CHARS_PER_PAGE = 1000;
export const CHARS_PER_MANUSCRIPT = 200;

export interface PageLength {
  min: number;
  max: number;
  /** 안내문에 적힌 표현 그대로 */
  text: string;
  unit: "page" | "manuscript";
}

const KO_NUM: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 반: 0.5 };
const NUM = "\\d{1,2}(?:\\.\\d)?|\\d\\s*/\\s*\\d|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|반";
const TAIL = "(이내|이하|이상|내외|정도|안팎|가량|분량|정도의\\s*분량)?";

// 원고지: "원고지 5매", "200자 원고지 4매 이상"
const MANUSCRIPT = new RegExp(`원고지\\s*(${NUM})(?:\\s*[~∼–-]\\s*(${NUM}))?\\s*매\\s*${TAIL}`);
// 쪽·페이지는 단위만으로 쪽수다. 장은 A4·용지·편지지처럼 종이임을 알리는 말이 앞에 있을 때만("카드뉴스 6장"의 장은 쪽이 아니다).
const PAGE_UNIT = new RegExp(`(?<![가-힣\\d])(${NUM})(?:\\s*[~∼–-]\\s*(${NUM}))?\\s*(?:쪽|페이지|page|pages|p)(?![가-힣a-z])\\s*${TAIL}`, "i");
const PAGE_SHEET = new RegExp(`(?:A4|a4|용지|편지지|한글|워드|문서)\\s*(?:용지\\s*)?(${NUM})(?:\\s*[~∼–-]\\s*(${NUM}))?\\s*(?:장|매)(?![가-힣])\\s*${TAIL}`);
// "한 장 분량"처럼 분량·이내·내외가 바로 붙은 한 장은 쪽으로 본다.
const ONE_SHEET = new RegExp(`(?<![가-힣\\d])(한|두|세)\\s*장\\s*(분량|이내|내외|정도|안팎|짜리)`);

function toNum(s: string | undefined): number | null {
  if (!s) return null;
  const t = s.replace(/\s/g, "");
  if (KO_NUM[t] !== undefined) return KO_NUM[t];
  const frac = t.match(/^(\d)\/(\d)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function range(lo: number, hi: number | null, tail: string | undefined, per: number): { min: number; max: number } | null {
  if (lo <= 0 || lo > 40) return null;
  if (hi !== null) {
    if (hi < lo || hi > 40) return null;
    return { min: Math.round(lo * per * 0.8), max: Math.round(hi * per) };
  }
  const t = (tail ?? "").replace(/\s/g, "");
  if (t === "이내" || t === "이하") return { min: Math.round(lo * per * 0.6), max: Math.round(lo * per) };
  if (t === "이상") return { min: Math.round(lo * per), max: Math.round(lo * per * 1.3) };
  return { min: Math.round(lo * per * 0.8), max: Math.round(lo * per * 1.1) };
}

// "3쪽 이상의 자료를 찾아", "12쪽 책을 읽고"의 쪽수는 읽을 자료의 분량이지 쓸 글의 분량이 아니다.
const READING_AFTER = /^[^.。]{0,14}?(?:자료|책|논문|기사|보고서를s*(?:읽|찾|참고)|읽|검색|찾아|참고)/;

/** 한 문장(또는 설명)에서 쪽·장·매 분량을 찾는다. 없으면 null. */
export function findPageLength(text: string): PageLength | null {
  const found = findRaw(text ?? "");
  if (!found) return null;
  const t = text ?? "";
  const at = t.indexOf(found.text);
  if (at >= 0 && READING_AFTER.test(t.slice(at + found.text.length))) return null;
  return found;
}

function findRaw(text: string): PageLength | null {
  const t = text ?? "";
  let m = t.match(MANUSCRIPT);
  if (m) {
    const lo = toNum(m[1]);
    const r = lo ? range(lo, toNum(m[2]), m[3], CHARS_PER_MANUSCRIPT) : null;
    if (r) return { ...r, text: m[0].trim(), unit: "manuscript" };
  }
  for (const re of [PAGE_SHEET, PAGE_UNIT]) {
    m = t.match(re);
    if (!m) continue;
    const lo = toNum(m[1]);
    const r = lo ? range(lo, toNum(m[2]), m[3], CHARS_PER_PAGE) : null;
    if (r) return { ...r, text: m[0].trim(), unit: "page" };
  }
  m = t.match(ONE_SHEET);
  if (m) {
    const lo = toNum(m[1]);
    const r = lo ? range(lo, null, m[2] === "이내" ? "이내" : undefined, CHARS_PER_PAGE) : null;
    if (r) return { ...r, text: m[0].trim(), unit: "page" };
  }
  return null;
}

const norm = (s: string) => s.replace(/[\s()\[\]{}<>"'`·・,.:;!?~\-–—/]/g, "").toLowerCase();

/**
 * 이 단계에 걸리는 쪽·장·매 분량. 단계 설명에 적힌 것은 이 단계 것이고, 요구사항·작성 기준의 문장은 이 단계 이름을 언급할 때만(단계가 하나뿐이면 전체) 이 단계 것이다.
 * 한 문장이 다른 단계 이름도 함께 언급하면 어느 단계 것인지 알 수 없으므로 주지 않는다("전체 A4 1장" 같은 총량을 단계마다 복사하지 않는다).
 */
export function pageLengthForElement(
  el: { label: string; description: string },
  requirements: string[],
  guide: string | undefined,
  labels: string[]
): PageLength | null {
  const own = findPageLength(el.description);
  if (own) return own;
  const mine = norm(el.label);
  const others = labels.map(norm).filter((l) => l.length >= 2 && l !== mine);
  const sentences = [...requirements, ...(guide ?? "").split(/(?<=[.。!?])\s+|\n+/)].map((s) => s.trim()).filter(Boolean);
  for (const s of sentences) {
    const p = findPageLength(s);
    if (!p) continue;
    if (labels.length <= 1) return p;
    const n = norm(s);
    if (mine.length >= 2 && n.includes(mine) && !others.some((o) => n.includes(o))) return p;
  }
  return null;
}
