// 안내문이 "추가 자료(그림·표·그래프 등)를 1개 이상 포함"·"이미지를 넣을 것"이라고 했는데 글에 그 자리가 없으면 코드가 자리를 만든다.
// alias import 없음 — node:test에서 바로 불러옴.
//
// 왜(2026-11-15, 거대 안내문 점검 과학-01·정보-01): 요구사항에 "추가 자료는 1개 이상으로 포함할 것"이 있는데 두 번 연속 글에 그림·표·그래프도,
// 넣을 자리 안내도 없었다. 모델은 글만 쓰고 "자료"는 설명하는 글에 흡수된다고 본다. 표·그래프를 요구하는 경우는 data-visual.ts가
// 수치를 표로 쓰게 하지만, "추가 자료"처럼 **종류를 말하지 않는** 요구는 그 규칙이 못 읽는다.
// AI가 학생 대신 그림을 만들 수는 없으니 학생이 채울 자리를 `[붙일 자료: …]`로 두는 것이 정직한 이행이다(paste-slot.ts와 같은 표기).
// 이미 표나 자리 표시가 있으면 건드리지 않는다.

const SLOT = "[붙일 자료: 본문 내용을 뒷받침하는 그림·표·그래프 등 추가 자료 — 직접 만들거나 구해서 붙일 것]";

/** "추가 자료 1개 이상 포함" 꼴 요구인가. 종류를 한정·금지한 문장은 다른 규칙(data-visual)이 읽는다. */
const EXTRA =
  /(?:추가|보조|참고|시각)\s*자료[^.\n]{0,25}(?:\d+|한|하나|두|세)\s*(?:개|가지|장|건)?\s*이상[^.\n]{0,15}(?:포함|첨부|삽입|넣|사용|활용)|(?:이미지|사진|그림|그래프|도표)(?:\([^)]{0,30}\))?\s*(?:를|을|도)?\s*(?:\d+|한|하나)\s*(?:개|장)?\s*이상[^.\n]{0,12}(?:포함|첨부|삽입|넣)|(?:이미지|사진|그림)(?:\([^)]{0,30}\))?\s*(?:를|을)\s*(?:(?:\d+|한|하나)\s*(?:개|장)?\s*)?(?:삽입|첨부|포함|넣)/;

export function wantsExtraMaterial(texts: string[]): boolean {
  return texts.some((t) => (t ?? "").split(/(?<=[.。!?])\s+|\n+/).some((s) => EXTRA.test(s) && !/금지|없이|사용할\s*수\s*없|쓰지\s*말/.test(s)));
}

const HAS_SLOT = /\[붙일\s*자료[^\]]*\]|\[(?:그림|그래프|표|이미지|사진)[^\]]*\]/;
const HAS_TABLE = /^\|.*\|\s*\n\|[\s:|-]+\|/m;

/** 글에 추가 자료(표·붙일 자료 표시)가 하나도 없으면 본론 끝(없으면 결론·요약·참고문헌 앞, 그것도 없으면 맨 끝)에 자리를 둔다. */
export function ensureExtraMaterialSlot(content: string): { content: string; added: boolean } {
  if (HAS_SLOT.test(content) || HAS_TABLE.test(content)) return { content, added: false };
  const lines = content.replace(/\s+$/, "").split("\n");
  const headIdx = lines.map((l, i) => (/^#{2,4}\s/.test(l) ? i : -1)).filter((i) => i >= 0);
  const nameAt = (i: number) => lines[i].replace(/^#+\s*/, "").trim();
  let at = lines.length;
  const bon = headIdx.find((i) => /^본\s*론$/.test(nameAt(i)));
  if (bon !== undefined) {
    const next = headIdx.find((i) => i > bon);
    at = next ?? lines.length;
  } else {
    const tail = headIdx.find((i) => /^(?:결\s*론|요\s*약|참고\s*문헌|참고\s*자료)$/.test(nameAt(i)));
    if (tail !== undefined) at = tail;
  }
  const before = lines.slice(0, at);
  while (before.length && !before[before.length - 1].trim()) before.pop();
  const after = lines.slice(at);
  const out = [...before, "", SLOT, ...(after.length ? ["", ...after] : [])].join("\n");
  return { content: out, added: true };
}
