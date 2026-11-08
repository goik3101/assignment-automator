// 양식지의 번호 칸이 **칸마다 같은 하위 칸**으로 이루어진 과제를 읽는다.
//
// 왜(실측 2026-11-03, 역사 카드뉴스): 안내문은 "각 번호 칸은 내용과 그 아래 '들어갈 말'로 구성됩니다",
// "①~⑥의 6개 칸을 작성한다. 각 칸에는 내용과 들어갈 말을 구성한다"라고 두 번 말한다. 그런데 결과물은
// "### 내용"을 한 번만 쓰고 ①~⑥에는 들어갈 말만 냈다 — 그림을 그릴 칸이 다섯 개 비었다(정답 채점 5/8).
//
// 안내문 **글**에서 읽는다(구조가 아니라) — 같은 사진을 3회 분석해도 이 문장은 그대로였고 required_items는 흔들렸다.
// 번호만 적힌 칸(①, 1, 장면 3)에만 적용한다. 이름이 있는 항목(원인·양상)은 건드리지 않는다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

/** "각 칸은 A와 B로 구성", "칸마다 A와 B를 쓴다" — 칸을 나누는 하위 칸 이름. */
const CELL_WORD = String.raw`(?:번호\s*)?(?:칸|장면|컷|카드|면)`;
const RULES: RegExp[] = [
  // "각 칸은 A와 (그 아래) B로 구성", "각 칸은 A 영역과 B 영역으로 구성"
  new RegExp(String.raw`각\s*${CELL_WORD}(?:은|는|에는|에|마다)?\s*([^.。
]{2,40}?)\s*(?:와|과)\s*(?:그\s*아래\s*)?([^.。
]{2,40}?)\s*(?:로|으로)?\s*구성`),
  // "각 칸에 A와 (그 아래) B를 작성/적는다"
  new RegExp(String.raw`각\s*${CELL_WORD}(?:에는|에|마다)\s*([^.。
]{2,40}?)\s*(?:와|과)\s*(?:그\s*아래\s*)?([^.。
]{2,40}?)\s*(?:을|를)\s*(?:구성|작성|적|쓴)`),
  new RegExp(String.raw`${CELL_WORD}마다\s*([^.。
]{2,40}?)\s*(?:와|과)\s*([^.。
]{2,40}?)\s*(?:을|를)\s*(?:적|쓴|작성)`),
];
// 따옴표·조사만 떼고 이름 그대로 쓴다(안내문 낱말을 바꾸면 학생이 양식과 못 맞춘다).
const trim = (s: string) =>
  s
    .replace(/^[\s'"‘’“”<>()]+|[\s'"‘’“”<>()]+$/g, "")
    // "내용 영역과 '들어갈 말' 영역" — 영역·부분·자리는 칸을 가리키는 말이지 칸 이름이 아니다.
    .replace(/\s*(?:영역|부분|자리)$/, "")
    .replace(/^[\s'"‘’“”<>()]+|[\s'"‘’“”<>()]+$/g, "")
    .replace(/(?:을|를|은|는|이|가)$/, "")
    .trim();
const BAD = /^(?:그|이|저|내용물|것|등|및)$/;

/** 안내문 글에서 "칸마다 쓸 하위 칸 이름"을 읽는다. 없으면 빈 배열. */
export function cellSubfields(texts: (string | undefined)[]): string[] {
  // 문장 단위로 본다 — 문장을 넘어 이어 붙으면 엉뚱한 말이 칸 이름이 된다.
  // 실측(2026-11-03): "카드뉴스는 주요 쟁점을 그림이나 사진 등의 시각 자료와 간략한 글로 제시한다"에 걸려
  // 칸 이름이 "칸에는 시각 자료"·"간략한 글"로 잡혔고, 결과물 소제목이 "### ② 칸에는 시각 자료"가 됐다.
  for (const t of texts) {
    if (!t) continue;
    for (const sentence of t.split(/(?<=[.。!?])\s*|\n+/)) {
      for (const re of RULES) {
        const m = re.exec(sentence);
        if (!m) continue;
        const a = trim(m[1]);
        const b = trim(m[2]);
        if (!a || !b || a === b || BAD.test(a) || BAD.test(b)) continue;
        // 칸 이름에 칸 자체를 가리키는 말이나 긴 수식이 들어가면 잘못 뽑은 것이다.
        // 칸을 가리키는 말 자체가 칸 이름이 될 수는 없다. 다만 **낱말 전체**로 볼 것 —
        // "면"을 그냥 포함으로 보면 "화면 설명"이 걸려 "장면마다 화면 설명과 대사" 같은 흔한 문장을 놓친다(2026-11-09 규칙 전수).
        // 칸 이름이 칸을 가리키는 말이거나 그 말로 **시작**하면 버린다("칸 제목"·"장면 설명").
        // 다만 그 글자가 **안에** 들어 있는 것은 괜찮다 — "화면 설명"은 멀쩡한 칸 이름이다.
        const isCellWord = (x: string) => /^(?:번호\s*)?(?:칸|장면|컷|카드|면)(?:\s|$)/.test(x);
        if ([a, b].some((x) => x.length > 12 || isCellWord(x) || /등의|제시|구성|작성/.test(x) || x.split(/\s+/).length > 2)) continue;
        return [a, b];
      }
    }
  }
  return [];
}

/** 번호만 적힌 칸인가 — "①", "3", "장면 2". 이름이 있는 항목은 아니다. */
export function isBareCell(item: string): boolean {
  return /^(?:[①-⑳]|\(?\d{1,2}\)?[.)]?|(?:장면|컷|카드|칸)\s*\d{1,2})$/.test(item.trim());
}

/** 번호 칸을 "① 내용", "① 들어갈 말"처럼 하위 칸까지 펼친다. 번호 칸이 2개 미만이면 그대로 둔다. */
export function expandCells(items: string[] | undefined, subs: string[]): string[] | undefined {
  if (!items || subs.length < 2) return items;
  const cells = items.filter(isBareCell);
  if (cells.length < 2) return items;
  const out: string[] = [];
  for (const it of items) {
    if (!isBareCell(it)) {
      out.push(it);
      continue;
    }
    for (const s of subs) out.push(`${it.trim()} ${s}`);
  }
  return out;
}

/** 프롬프트에 붙일 한 줄 — 칸마다 두 가지를 모두 써야 한다는 것. */
export function cellSubfieldBlock(subs: string[], cellCount: number): string {
  if (subs.length < 2 || cellCount < 2) return "";
  return `\n【칸 구성 — 반드시 지킬 것】 번호 칸 ${cellCount}개는 칸마다 ${subs.map((s) => `"${s}"`).join("와 ")}를 **둘 다** 쓴다. 한 칸에 하나만 쓰거나, "${subs[0]}"을 맨 위에 한 번만 쓰고 넘어가지 말 것 — 칸마다 따로 쓴다.\n`;
}
