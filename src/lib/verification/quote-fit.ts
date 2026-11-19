// 책 구절 검증(excerpt-verification.ts judge)이 "이 구절·이 출처를 학생 글에 써도 되는가"를 가르는 순수 함수들(alias import 없음 — 테스트용).
// 2026-11-19 사용자 결과물(공통국어 책 처방전)에서 확인된 세 구멍:
//  ① 한국어 제목의 책인데 인상 깊은 구절이 **포르투갈어 원문**이었다(한국어 학생 글에 번역 없는 외국어 인용).
//  ② 그 구절의 출처가 "책 전문을 올린 PDF 공유 페이지"였다(원문 일치를 보장할 수 없고 저작권도 불안).
//  ③ 출처를 "인용한 페이지"가 아니라 그라운딩 결과 중 **처음 나온 허용 도메인**으로 붙여, 구절과 상관없는 페이지가 각주가 될 수 있었다.

/** 글자(한글·영문·그 밖의 문자) 중 한글의 비율. 글자가 없으면 0. */
export function hangulShare(text: string): number {
  const letters = text.match(/[\p{L}]/gu) ?? [];
  if (letters.length === 0) return 0;
  const hangul = letters.filter((c) => /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(c)).length;
  return hangul / letters.length;
}

/**
 * 한국어 제목의 책에서 한글이 거의 없는 구절은 외국어 원문이다 — 한국어판 구절이 아니라 쓸 수 없다.
 * 책 제목에 한글이 없으면(영어 원서 과제 등) 판단하지 않는다.
 */
export function isForeignExcerpt(excerpt: string, workName: string): boolean {
  if (hangulShare(workName) < 0.3) return false;
  const letters = (excerpt.match(/[\p{L}]/gu) ?? []).length;
  if (letters < 8) return false;
  return hangulShare(excerpt) < 0.2;
}

const DUMP_HOSTS = [
  "scribd.com",
  "pdfcoffee.com",
  "dokumen.pub",
  "vdoc.pub",
  "epdf.pub",
  "ebin.pub",
  "idoc.pub",
  "pdfdrive.com",
  "pdfroom.com",
  "yumpu.com",
  "studylib.net",
  "docplayer.net",
  "docplayer.org",
  "fliphtml5.com",
  "anyflip.com",
  "z-lib.org",
  "libgen.is",
  "libgen.rs",
  "1lib.sk",
];

/** 책 전문을 올려 둔 문서 공유·PDF 덤프 사이트 — 책 구절의 출처로 쓰지 않는다. */
export function isFullTextDump(url: string, title?: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (DUMP_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return true;
  } catch {
    /* 주소를 못 읽으면 제목만 본다 */
  }
  // "(pdf)", "(epub)" 같은 파일 형식 꼬리표가 붙은 페이지 제목 — 업로드된 책 파일이다.
  return !!title && /\((?:pdf|epub|mobi)\)/i.test(title);
}

export interface QuoteChunk {
  web?: { uri?: string; title?: string };
}

/**
 * 구절을 확인했다는 조사자의 sourceTitle과 제목·도메인이 맞는 허용 출처를 먼저 고르고, 없으면 첫 허용 출처로 둔다.
 * `weak(url)`은 동영상·위키·블로그 등 구절 근거로 쓰지 않는 주소 판정.
 */
export function pickQuoteChunk<T extends QuoteChunk>(
  chunks: T[],
  sourceTitle: string | undefined,
  weak: (url: string) => boolean
): T | undefined {
  const ok = chunks.filter((c) => c.web?.uri && !weak(c.web.uri) && !isFullTextDump(c.web.uri, c.web.title));
  if (ok.length === 0) return undefined;
  const said = (sourceTitle ?? "").toLowerCase().replace(/\s+/g, "");
  if (said) {
    const hit = ok.find((c) => {
      const title = (c.web?.title ?? "").toLowerCase().replace(/\s+/g, "");
      let host = "";
      try {
        host = new URL(c.web!.uri!).hostname.replace(/^www\./, "").toLowerCase();
      } catch {
        /* 무시 */
      }
      return (title && said.includes(title)) || (title && title.includes(said)) || (host && said.includes(host.split(".")[0]));
    });
    if (hit) return hit;
  }
  return ok[0];
}
