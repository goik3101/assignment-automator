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

/**
 * 모델이 생성한 본문에 groundingSupports를 이용해 문장 뒤 [n] 각주를 삽입한다.
 *
 * 주의: Gemini의 segment.startIndex/endIndex는 "UTF-8 바이트" 기준 오프셋이다.
 * JS 문자열 인덱스(UTF-16 코드유닛)와 다르기 때문에, 반드시 Buffer로 바꿔서
 * 바이트 단위로 삽입해야 한글처럼 멀티바이트 문자가 섞인 텍스트에서 위치가
 * 어긋나지 않는다.
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
    const end = support.segment!.endIndex ?? 0;
    if (end > buf.length) continue;

    buf = Buffer.concat([buf.subarray(0, end), marker, buf.subarray(end)]);
  }

  return buf.toString("utf-8");
}
