// PDF 출처의 글자를 뽑는다. 우리 링크 검증은 HTML만 본문을 저장해서, 통계청·보고서·강의자료 PDF는 열리는데도 "문장이 그 페이지에 있는가"를 확인하지 못했다
// (저장 결과물의 고유 출처 37개 중 17개가 못 읽혔고 PDF가 3분의 1, 2026-11-21).
// 큰 PDF가 응답 시간을 먹지 않게 **쪽 수와 시간을 모두 제한**하고, 다 못 읽었으면 `partial`로 알려 준다 — 못 읽은 쪽에 값이 있을 수 있어서
// 호출하는 쪽(claim-check)은 partial 문서에서 값을 못 찾아도 각주를 지우지 않는다. alias import 없음.

export interface PdfTextResult {
  text: string;
  /** 쪽 수·시간 제한 때문에 앞부분만 읽었다. */
  partial: boolean;
  pages: number;
}

export const PDF_MAX_BYTES = 6_000_000;

export async function extractPdfText(bytes: Uint8Array, opts: { maxPages?: number; maxMs?: number } = {}): Promise<PdfTextResult | null> {
  const maxPages = opts.maxPages ?? 40;
  const maxMs = opts.maxMs ?? 3000;
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), maxMs);
  });
  try {
    const run = (async (): Promise<PdfTextResult | null> => {
      const { getDocumentProxy } = await import("unpdf");
      const doc = await getDocumentProxy(new Uint8Array(bytes));
      const total = doc.numPages;
      const limit = Math.min(total, maxPages);
      const parts: string[] = [];
      let read = 0;
      for (let i = 1; i <= limit; i++) {
        if (Date.now() - started > maxMs) break;
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        parts.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
        read = i;
      }
      const text = parts.join("\n").replace(/\s+/g, " ").trim();
      return text ? { text, partial: read < total, pages: total } : null;
    })();
    return await Promise.race([run, timeout]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
