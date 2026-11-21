import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPdfText } from "./pdf-text.ts";

// 손으로 만든 최소 PDF(xref 없음 — pdf.js가 복구한다). 외부 파일 없이 추출 경로 전체를 시험한다.
function tinyPdf(lines: string[]): Uint8Array {
  const content = lines.map((l, i) => `BT /F1 12 Tf 10 ${280 - i * 20} Td (${l}) Tj ET`).join("\n");
  const pdf =
    "%PDF-1.4\n" +
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 300]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n" +
    `4 0 obj<</Length ${content.length}>>stream\n${content}\nendstream endobj\n` +
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n" +
    "trailer<</Root 1 0 R/Size 6>>\n%%EOF";
  return new TextEncoder().encode(pdf);
}

test("PDF에서 글자를 뽑고, 다 읽었으면 partial이 아니다", async () => {
  const r = await extractPdfText(tinyPdf(["about 350,000 people were in the city", "height 61.8 cm"]));
  assert.ok(r, "텍스트를 못 뽑았다");
  assert.match(r!.text, /350,000/);
  assert.match(r!.text, /61\.8/);
  assert.equal(r!.partial, false);
  assert.equal(r!.pages, 1);
});

test("깨진 데이터는 null이고 던지지 않는다", async () => {
  assert.equal(await extractPdfText(new Uint8Array([1, 2, 3, 4])), null);
});

test("쪽 수 제한(maxPages=0)이면 아무것도 못 읽어 null", async () => {
  assert.equal(await extractPdfText(tinyPdf(["x y z"]), { maxPages: 0 }), null);
});
