// 안내문이 "이 시기를 다뤄라"라고 기간을 못 박은 과제가 있다. 역사 신문이 대표적이다 —
// 글을 그 시점에서 쓰는 것이라, 범위 밖의 일을 이미 일어난 것처럼 쓰면 과제 자체가 어긋난다.
//
// 실측(2026-11-01, 사용자 결과물.10 — 한국사 현대사 신문): 안내문이 "범위: 광복부터 대한민국 정부 수립 사이
// 시기(1945.8.15.~1948.8.15.)"라고 빨간 밑줄까지 그어 두었는데, 결과물은 제주 4·3의 공식 정의를 설명하며
// "1954년 9월 21일까지의 충돌을 포함한다"고 썼다. 1948년 8월에 쓰는 신문이 6년 뒤 일을 알 수 없다.
//
// 기간이 적히지 않은 과제에서는 아무것도 하지 않는다(국어·과학·영어·사회 안내문에는 이런 조건이 없다).
// alias import 없음 — node:test에서 바로 불러올 수 있게.

export interface TimeRange {
  startYear: number;
  endYear: number;
  /** 안내문에 적힌 표현 그대로(프롬프트에 그대로 전한다). */
  text: string;
}

const YEAR = "(1[6-9]\\d{2}|20\\d{2})";
// "1945.8.15.~1948.8.15." / "1945년~1948년" / "1945년 8월 15일부터 1948년 8월 15일까지"
const RANGE_PATTERNS = [
  new RegExp(`${YEAR}\\s*[.년]\\s*\\d{1,2}\\s*[.월]\\s*\\d{1,2}\\s*[.일]?\\s*(?:~|-|–|—|부터|에서)\\s*${YEAR}\\s*[.년]\\s*\\d{1,2}\\s*[.월]\\s*\\d{1,2}`),
  new RegExp(`${YEAR}\\s*년?\\s*(?:~|-|–|—|부터|에서)\\s*${YEAR}\\s*년?(?:\\s*까지)?`),
];
/** 기간을 "다뤄야 할 범위"로 말하는 문장인가 — 제출 기한·수업 일정과 섞이지 않게 한다. */
const RANGE_CUE = /범위|시기|기간|사이|시대|연간|발행\s*시기|소재로|다룰|다루는/;
const NOT_RANGE = /제출|기한|마감|평가\s*일시|시험\s*일시|수업\s*일정|차시/;

/** 안내문 글에서 "다뤄야 할 기간"을 찾는다. 없으면 null. */
export function findTimeRange(texts: (string | undefined)[]): TimeRange | null {
  for (const raw of texts) {
    for (const line of (raw ?? "").split(/[\n]|(?<=[.。])\s+/)) {
      if (!RANGE_CUE.test(line) || NOT_RANGE.test(line)) continue;
      for (const re of RANGE_PATTERNS) {
        const m = re.exec(line);
        if (!m) continue;
        const startYear = Number(m[1]);
        const endYear = Number(m[2]);
        if (!(startYear >= 1600 && endYear >= startYear && endYear - startYear <= 200)) continue;
        return { startYear, endYear, text: m[0].trim() };
      }
    }
  }
  return null;
}

export function timeRangeBlock(range: TimeRange | null): string {
  if (!range) return "";
  return (
    `\n【다룰 시기 — 반드시 지킬 것】 이 과제가 다루는 시기는 ${range.text}다. ` +
    `글은 그 시기 안에서 쓰는 것이므로, **그 뒤에 일어난 일을 이미 아는 것처럼 쓰지 말 것** ` +
    `(${range.endYear}년 이후의 사건·통계·평가, 뒷날 붙은 공식 정의나 결과를 끌어오지 말 것). ` +
    `배경으로 그 이전 일을 설명하는 것은 괜찮다. 날짜를 쓸 때는 ${range.startYear}~${range.endYear}년 안인지 확인할 것.\n`
  );
}

export interface OutOfRangeHit {
  year: number;
  text: string;
}

/** 본문에서 범위 밖 연도를 쓴 문장. 출처 목록 줄과 표는 보지 않는다. */
export function findOutOfRange(content: string, range: TimeRange | null): OutOfRangeHit[] {
  if (!range) return [];
  const hits: OutOfRangeHit[] = [];
  const seen = new Set<number>();
  const lines = content.split("\n").filter((l) => !/^\s*(?:#|\||[-*•]?\s*\S.*:\s*https?:\/\/)/.test(l));
  for (const line of lines) {
    for (const s of line.split(/(?<=[.!?。](?:\[\d+\])*)\s+/)) {
      const text = s.replace(/\[\d+\]/g, "").trim();
      if (text.length < 8) continue;
      for (const m of text.matchAll(/(?<![\d.,])(1[6-9]\d{2}|20\d{2})\s*년/g)) {
        const year = Number(m[1]);
        if (year >= range.startYear && year <= range.endYear) continue;
        if (seen.has(year)) continue;
        seen.add(year);
        hits.push({ year, text });
      }
    }
  }
  return hits;
}

export function outOfRangeRepairText(range: TimeRange, hits: OutOfRangeHit[]): string {
  const quoted = hits.slice(0, 2).map((h) => `${h.year}년("${h.text.slice(0, 40)}…")`).join(" / ");
  return (
    `안내문이 다룰 시기를 ${range.text}로 정했는데 그 밖의 연도를 썼다(${quoted}). ` +
    `이 글은 ${range.endYear}년 시점에서 쓰는 것이므로 그 뒤에 일어난 일은 알 수 없다 — 해당 문장을 ` +
    `${range.startYear}~${range.endYear}년 안의 사실로 바꾸거나, 그 뒤의 일을 말하는 부분을 빼고 다시 쓸 것. ` +
    `나머지 문장과 각주는 그대로 둘 것.`
  );
}
