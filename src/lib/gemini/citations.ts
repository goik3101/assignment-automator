import type { SourceRef } from "@/types/task";

// Gemini Search Grounding이 돌려주는 타입은 SDK 버전마다 미세하게 다를 수 있어
// 여기서는 실제로 쓰는 필드만 최소한으로 정의해 느슨하게 받는다.
export interface GroundingChunkLike {
  web?: { uri?: string; title?: string };
}
export interface GroundingSupportLike {
  segment?: { startIndex?: number; endIndex?: number };
  groundingChunkIndices?: number[];
}

/**
 * groundingChunks(검색 결과 웹페이지 목록)에서 중복 URL을 제거하고
 * 1번부터 번호를 매긴 출처 목록을 만든다. url_valid는 아직 검증 전이라 null.
 */
export function buildSourceList(chunks: GroundingChunkLike[] | undefined): {
  sources: SourceRef[];
  /** 원래 chunk 배열 인덱스 -> 이 sources 배열에서의 번호(n) */
  chunkIndexToN: Map<number, number>;
} {
  const sources: SourceRef[] = [];
  const urlToN = new Map<string, number>();
  const chunkIndexToN = new Map<number, number>();

  (chunks ?? []).forEach((chunk, i) => {
    const uri = chunk.web?.uri;
    if (!uri) return;
    let n = urlToN.get(uri);
    if (n === undefined) {
      n = sources.length + 1;
      urlToN.set(uri, n);
      sources.push({ n, title: chunk.web?.title || uri, url: uri, url_valid: null });
    }
    chunkIndexToN.set(i, n);
  });

  return { sources, chunkIndexToN };
}

// 실제로 발견된 심각한 버그(2026-09-14, 방정환 결과물 감사): Gemini가 주는
// segment.endIndex(바이트 오프셋)가 한글 음절처럼 멀티바이트 문자의 "중간"을
// 가리키는 경우가 실제로 있었다 — 문장·절 경계에 맞춰 잘라줄 거라고 가정했지만
// 보장되지 않는다. 그 상태로 Buffer.subarray(0, end)/subarray(end)로 자르면
// 한 글자가 앞뒤로 쪼개져서 양쪽 다 깨진 UTF-8 바이트가 되고, 다시 문자열로
// 바꾸는 순간(buf.toString("utf-8")) Node가 그 깨진 바이트마다 U+FFFD(�)로
// 치환해버린다 — 실제 사고에서 각주 [n] 바로 앞뒤에 �가 나온 이유가 이것이다
// (문장 하나에 여러 개의 grounding support가 걸리면 같은 문제가 여러 번
// 반복되어 한 문단에 �가 여러 개 나올 수 있음, 실제로 관찰됨). 문자 중간이
// 아니라 "그 문자가 끝나는 지점"까지 안전하게 밀어서 자르도록 방어한다.
function snapToUtf8CharBoundary(buf: Buffer, index: number): number {
  let i = Math.max(0, Math.min(index, buf.length));
  // UTF-8 continuation byte는 상위 2비트가 10xxxxxx(0x80~0xBF)다 — 그 위치에서
  // 자르면 멀티바이트 문자가 반으로 쪼개진다. 문장을 거꾸로 잘라내는 대신
  // (내용 손실 위험), 그 문자가 끝날 때까지 앞으로 이동해서 각주가 그 글자
  // 바로 뒤에 달리게 한다 — 위치가 한 글자 정도 밀릴 뿐, 텍스트 손실은 없다.
  while (i < buf.length && (buf[i] & 0xc0) === 0x80) {
    i++;
  }
  return i;
}

/**
 * 모델이 생성한 본문에 groundingSupports를 이용해 문장 뒤 [n] 각주를 삽입한다.
 *
 * 주의: Gemini의 segment.startIndex/endIndex는 "UTF-8 바이트" 기준 오프셋이다.
 * JS 문자열 인덱스(UTF-16 코드유닛)와 다르기 때문에, 반드시 Buffer로 바꿔서
 * 바이트 단위로 삽입해야 한글처럼 멀티바이트 문자가 섞인 텍스트에서 위치가
 * 어긋나지 않는다. 그 바이트 오프셋 자체가 문자 중간을 가리킬 수도 있어서
 * (snapToUtf8CharBoundary 참고) 실제 자르는 지점은 그보다 뒤일 수 있다.
 */
export function insertCitationMarkers(
  text: string,
  supports: GroundingSupportLike[] | undefined,
  chunkIndexToN: Map<number, number>
): string {
  if (!supports || supports.length === 0) return text;

  // endIndex 기준 내림차순으로 정렬해서 뒤에서부터 삽입해야
  // 앞쪽에서 계산해둔 바이트 오프셋이 밀리지 않는다.
  const sorted = [...supports]
    .filter((s) => s.segment?.endIndex !== undefined)
    .sort((a, b) => (b.segment!.endIndex ?? 0) - (a.segment!.endIndex ?? 0));

  let buf = Buffer.from(text, "utf-8");

  for (const support of sorted) {
    const ns = (support.groundingChunkIndices ?? [])
      .map((i) => chunkIndexToN.get(i))
      .filter((n): n is number => n !== undefined);
    if (ns.length === 0) continue;

    const marker = Buffer.from(ns.map((n) => `[${n}]`).join(""), "utf-8");
    const rawEnd = support.segment!.endIndex ?? 0;
    if (rawEnd > buf.length) continue;
    const end = snapToUtf8CharBoundary(buf, rawEnd);

    buf = Buffer.concat([buf.subarray(0, end), marker, buf.subarray(end)]);
  }

  return buf.toString("utf-8");
}
