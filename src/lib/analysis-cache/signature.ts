// 안내문 전사 글의 **지문(MinHash)**. alias import 없음 — node:test에서 바로 불러온다.
//
// 같은 수행평가는 학생마다 사진이 달라도 안내문 글이 같다. 전사(OCR)는 사진마다 조금 달라서 글이 똑같지는 않으므로
// 글자 2-gram 집합의 MinHash로 "거의 같은 글"을 찾는다. 지문은 숫자 배열이라 글을 되살릴 수 없다(학생 이름이 섞여도 저장되지 않는다).
const NUM_HASHES = 96;

/** 한글·영문·숫자만 남기고(공백·기호·빈칸 표시 "___"·모르는 글자 "?" 제거) 소문자로. */
export function normalizeNotice(text: string): string {
  return text.toLowerCase().replace(/[^가-힣a-z0-9]/g, "");
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 1 < s.length; i++) out.add(s.slice(i, i + 2));
  return out;
}

function hash32(str: string, seed: number): number {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return h >>> 0;
}

/** 전사 글이 너무 짧으면(그림·빈 사진) 지문을 만들지 않는다 — 다른 안내문과 우연히 같아 보이는 것을 막는다. */
export const MIN_NOTICE_CHARS = 120;

export function noticeSignature(text: string): number[] | null {
  const norm = normalizeNotice(text);
  if (norm.length < MIN_NOTICE_CHARS) return null;
  const grams = [...bigrams(norm)];
  const sig: number[] = [];
  for (let k = 0; k < NUM_HASHES; k++) {
    let min = 0xffffffff;
    for (const g of grams) {
      const h = hash32(g, k * 0x9e3779b1);
      if (h < min) min = h;
    }
    sig.push(min);
  }
  return sig;
}

/** 두 지문이 같은 자리에서 같은 값인 비율 ≈ 글자 2-gram 집합의 자카드 유사도. */
export function signatureSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let same = 0;
  for (let i = 0; i < n; i++) if (a[i] === b[i]) same++;
  return same / n;
}
