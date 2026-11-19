// "책 제목·저자·인상적인 구절"만 칸으로 잡힌 책 소개 단계에 **본문 칸**을 하나 보탠다. alias import 없음 — node:test에서 바로 불러옴.
//
// 왜(2026-11-19, 사용자 개선 요청 — 공통국어 책 처방전 3차시): 안내문의 3차시는 "친구의 고민에 도움을 줄 책을 **소개함**"이고,
// "100자 원고지에 책 제목·저자·인상적인 구절을 적어 올 수 있도록 함"은 **미리 적어 오는 메모**다. 분석이 그 메모 세 칸만 필수 항목으로 잡아
// 글쓰기가 제목·저자·구절만 채웠고(327자, 계획 800~1,150자), **정작 소개·처방이 어디에도 없었다**("책과 고민의 연결이 약하다"는 지적과 같은 뿌리).
// 칸이 전부 서지 값(제목·저자…)과 구절뿐이고 단계 설명이 소개·추천·제안을 말하면, 그 소개 본문을 맡을 칸을 하나 더한다.

const BOOK_FIELD = /^(?:책\s*(?:이름|제목)|도서\s*(?:명|제목|이름)|서명|저자|지은이|글쓴이|작가|출판사|출판\s*사항)$/;
const PASSAGE = /구절|문장|인용/;
const INTRO_VERB = /소개|처방|추천|권하|제안/;
export const BOOK_BODY_ITEM = "책 소개와 추천 이유(고민과 연결)";

export function isBookFieldItem(name: string): boolean {
  return BOOK_FIELD.test((name ?? "").trim());
}

export function withBookBodyItem<
  T extends { task_elements?: { type: string; description?: string; required_items?: string[] }[] },
>(core: T): T {
  const els = core.task_elements;
  if (!els || !els.some((e) => needsBody(e))) return core;
  return {
    ...core,
    task_elements: els.map((e) => (needsBody(e) ? { ...e, required_items: [...(e.required_items ?? []), BOOK_BODY_ITEM] } : e)),
  };
}

function needsBody(e: { type: string; description?: string; required_items?: string[] }): boolean {
  const items = (e.required_items ?? []).map((i) => i.trim()).filter(Boolean);
  if (e.type !== "text_submission" || items.length < 2) return false;
  if (!items.some(isBookFieldItem)) return false;
  if (!items.every((i) => isBookFieldItem(i) || PASSAGE.test(i))) return false;
  return INTRO_VERB.test(e.description ?? "");
}
