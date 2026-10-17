import type { SourceRef } from "@/types/task";

/**
 * 검증 실패로 확인된 출처 번호(n)를 가리키는 [n] 각주 표시만 지운다(문장
 * 내용은 보존). generate-essay.ts/generate-plan.ts가 공유하는 로직이라 여기
 * 하나로 모아둔다 — 라에네크 결과물 감사(2026-09-16)에서 신설.
 * 각주 앞에 공백이 있던 자리([n] 바로 앞이 공백인 경우, 모델이 스스로 넣은
 * 것)는 각주를 지우면 "단어 ." 처럼 어색한 공백이 남을 수 있어 함께 정리한다.
 */
export function stripInvalidCitationMarkers(text: string, invalidNs: Set<number>): string {
  if (invalidNs.size === 0) return text;
  return text
    .replace(/\[(\d+)\]/g, (match, numStr) => (invalidNs.has(Number(numStr)) ? "" : match))
    .replace(/ +([.,!?」』])/g, "$1")
    .replace(/ {2,}/g, " ");
}

// Gemini Search Grounding이 돌려주는 타입은 SDK 버전마다 미세하게 다를 수 있어
// 여기서는 실제로 쓰는 필드만 최소한으로 정의해 느슨하게 받는다.
// 타입은 모델 호출 계층(llm/types.ts)이 정의한다 — 제공자가 달라도 같은 모양으로 정규화해서 넘어온다.
export type { GroundingChunkLike, GroundingSupportLike } from "../llm/types.ts";
import type { GroundingChunkLike, GroundingSupportLike } from "../llm/types.ts";

const TRACKING_PARAM = /^(utm_.*|fbclid|gclid|mc_cid|mc_eid|platform)$/i;

/** 추적용 쿼리(utm_*, platform=hootsuite 등)와 #조각을 뗀 주소 — 같은 페이지가 추적 값만 달라 출처로 두 번 올라오는 것을 막고, 학생이 여는 링크도 깔끔하게 한다. */
export function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAM.test(k)) u.searchParams.delete(k);
    u.hash = "";
    return u.toString();
  } catch {
    return raw;
  }
}

/** 페이지 제목이 비었거나 본문 조각(여러 줄·마크다운 제목)이 들어온 경우 호스트+경로로 대신한다. */
export function cleanSourceTitle(title: string | undefined, url: string): string {
  const t = (title ?? "").replace(/\s+/g, " ").replace(/^#+\s*/, "").trim();
  const multiline = /\n/.test((title ?? "").trim());
  if (t && !multiline && t.length <= 120) return t;
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean).pop();
    return (u.hostname.replace(/^www\./, "") + (seg ? " — " + decodeURIComponent(seg) : "")).slice(0, 120);
  } catch {
    return t.slice(0, 120) || url;
  }
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
    const rawUri = chunk.web?.uri;
    if (!rawUri) return;
    const uri = canonicalizeUrl(rawUri);
    let n = urlToN.get(uri);
    if (n === undefined) {
      n = sources.length + 1;
      urlToN.set(uri, n);
      sources.push({ n, title: cleanSourceTitle(chunk.web?.title, uri), url: uri, url_valid: null });
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
    // Gemini는 UTF-8 바이트, OpenAI는 UTF-16 글자 오프셋 — unit에 따라 바이트로 통일한다.
    const rawEndInUnit = support.segment!.endIndex ?? 0;
    const rawEnd = support.unit === "utf16" ? Buffer.byteLength(text.slice(0, rawEndInUnit), "utf-8") : rawEndInUnit;
    if (rawEnd > buf.length) continue;
    const end = snapToUtf8CharBoundary(buf, rawEnd);

    buf = Buffer.concat([buf.subarray(0, end), marker, buf.subarray(end)]);
  }

  return buf.toString("utf-8");
}

/**
 * 최종 출력 텍스트 위생 정리(순수 문자열 처리):
 *  - 각주를 지운 뒤 문장부호 앞에 남은 공백("~했다 .")을 붙인다.
 *  - 모델이 프롬프트의 항목 표기용 「」 부호를 소제목에 그대로 따라 쓴 경우("### 「혁명의
 *    배경」", 세계사 테스트에서 실제 발생)를 벗겨낸다.
 */
export function tidyOutputText(text: string): string {
  return text
    .replace(/^(#{2,4}[ \t]*)[「『](.+?)[」』][ \t]*$/gm, "$1$2")
    .replace(/[ \t]+([.,!?])(?=\s|$)/g, "$1")
    .replace(/(?<=\S)[ \t]{2,}/g, " ");
}
