import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hangulShare, isForeignExcerpt, isFullTextDump, pickQuoteChunk } from "./quote-fit.ts";

describe("isForeignExcerpt", () => {
  it("한국어 제목 책의 포르투갈어 구절은 외국어 원문이다 (2026-11-19 결과물)", () => {
    assert.equal(isForeignExcerpt("A GENTE VINHA DE MÃOS DADAS, sem pressa de nada pela rua.", "내 이름은 라임오렌지나무"), true);
  });
  it("한국어 구절은 통과", () => {
    assert.equal(isForeignExcerpt("손을 잡고 서두르지 않은 채 길을 걸었다.", "내 이름은 라임오렌지나무"), false);
  });
  it("한글 사이에 영어 낱말이 조금 섞인 구절은 통과", () => {
    assert.equal(isForeignExcerpt("그는 AI 시대의 아이였다고 말했다.", "미래 사회"), false);
  });
  it("영어 제목의 책은 판단하지 않는다 (영어 원서 과제)", () => {
    assert.equal(isForeignExcerpt("It is the time you have wasted for your rose that makes your rose so important.", "The Little Prince"), false);
  });
  it("아주 짧은 구절은 판단하지 않는다", () => {
    assert.equal(isForeignExcerpt("OK", "내 이름은 라임오렌지나무"), false);
  });
});

describe("isFullTextDump", () => {
  it("문서 공유·PDF 덤프 도메인은 책 전문 업로드다", () => {
    assert.equal(isFullTextDump("https://dokumen.pub/some-book.html"), true);
    assert.equal(isFullTextDump("https://www.scribd.com/document/123"), true);
    assert.equal(isFullTextDump("https://cdn.pdfcoffee.com/x"), true);
  });
  it("제목에 (pdf) 꼬리표가 있으면 업로드된 파일이다", () => {
    assert.equal(isFullTextDump("https://example.org/a", "José Mauro de Vasconcelos - Meu pé de laranja-lima (pdf)(rev)"), true);
  });
  it("서점·출판사·공공기관은 아니다", () => {
    assert.equal(isFullTextDump("https://product.kyobobook.co.kr/detail/S000", "내 이름은 라임오렌지나무 | 교보문고"), false);
    assert.equal(isFullTextDump("https://www.korea.kr/news/x.do"), false);
  });
});

describe("pickQuoteChunk", () => {
  const weak = (u: string) => u.includes("wikipedia.org");
  const chunks = [
    { web: { uri: "https://ko.wikipedia.org/wiki/x", title: "ko.wikipedia.org" } },
    { web: { uri: "https://dokumen.pub/x", title: "dokumen.pub" } },
    { web: { uri: "https://www.aladin.co.kr/shop/1", title: "aladin.co.kr" } },
    { web: { uri: "https://product.kyobobook.co.kr/detail/1", title: "kyobobook.co.kr" } },
  ];
  it("조사자가 말한 출처와 맞는 허용 출처를 먼저 고른다", () => {
    assert.ok(String(pickQuoteChunk(chunks, "교보문고 도서 상세 페이지(kyobobook.co.kr)", weak)?.web?.uri).includes("kyobobook"));
  });
  it("맞는 게 없으면 허용된 첫 출처 (위키·덤프는 건너뜀)", () => {
    assert.ok(String(pickQuoteChunk(chunks, "어딘가의 페이지", weak)?.web?.uri).includes("aladin"));
  });
  it("허용 출처가 하나도 없으면 undefined", () => {
    assert.equal(pickQuoteChunk(chunks.slice(0, 2), "x", weak), undefined);
  });
});

describe("hangulShare", () => {
  it("글자가 없으면 0", () => assert.equal(hangulShare("1234 ..."), 0));
});
