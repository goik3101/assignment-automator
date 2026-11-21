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
// 쪽당 글자가 이보다 적으면(스캔본에 표지 글자만 있는 문서 등) 다 읽었어도 "일부만 읽은 것"으로 본다 — 읽히지 않은 내용이 대부분일 수 있다.
const SPARSE_CHARS_PER_PAGE = 300;

export async function extractPdfText(bytes: Uint8Array, opts: { maxPages?: number; maxMs?: number } = {}): Promise<PdfTextResult | null> {
  // 실측(2026-11-22, 실제 PDF 9개): 40쪽 읽기 중앙 0.3초·최대 1.2초라 80쪽까지 올려도 시간 상한(3초)이 지킨다.
  const maxPages = opts.maxPages ?? 80;
  const maxMs = opts.maxMs ?? 3000;
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // 바깥 시간 제한은 안쪽(쪽 사이 점검)보다 길게 둔다 — 같으면 안쪽이 부분 결과를 돌려주기 전에 바깥이 null로 이겨 버린다. 바깥은 문서 열기가 멈춘 경우를 위한 것.
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), maxMs + 1500);
  });
  try {
    const run = (async (): Promise<PdfTextResult | null> => {
      const { getDocumentProxy } = await import("unpdf");
      // verbosity 0: 글꼴 경고("TT: undefined function")가 서버 로그를 덮지 않게 한다.
      const doc = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
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
      if (!text) return null;
      const sparse = read > 0 && text.length / read < SPARSE_CHARS_PER_PAGE;
      return { text, partial: read < total || sparse, pages: total };
    })();
    return await Promise.race([run, timeout]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
