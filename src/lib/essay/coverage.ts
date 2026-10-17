// 소제목 없이 하나의 글로 쓰는 단계(편지·신문 등, items_format === "flowing")가 안내문의 필수 항목을 다 다뤘는지 거르는 1차 검사.
// 키워드가 하나도 안 보이는 항목만 "의심"으로 올리므로 표현이 다른 경우를 놓치지는 않는다(거짓 경보는 있을 수 있다 — 그래서 의심 항목만 작은 모델이 한 번 더 판정한다).
// alias import 없음 — node:test에서 바로 불러올 수 있게.
import { classifyRequiredItem } from "./deliverable.ts";

export interface CoverageGap {
  label: string;
  missing: string[];
}

// 항목 이름에서 내용과 상관없는 서술어는 키워드로 쓰지 않는다.
const STOP = new Set([
  "서술", "전달", "활용", "명료", "명확", "구체", "구체적", "작성", "제시", "설명", "내용", "이유", "점", "및", "등", "대한", "통해", "위한", "관련",
  "논리", "정연", "한눈", "이해", "쉽게", "분야", "체계", "체계적", "방법", "과정", "사실", "자료",
]);
const JOSA_END = /(?:으로|에서|에게|에는|이라는|라는|하게|하여|하고|에|의|을|를|은|는|이|가|과|와|도|로)$/;

export function keywordsOf(item: string): string[] {
  return item
    .replace(/[()·/,]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(JOSA_END, ""))
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

/** 이 항목이 글에 다뤄져 보이는가(키워드·표·후기 표지 기준). */
export function itemLooksCovered(content: string, item: string): boolean {
  const kind = classifyRequiredItem(item);
  if (kind === "visual") return /^\s*\|.+\|\s*$/m.test(content) || /###\s*제작 참고/.test(content);
  if (kind === "reflection" && (/###\s*제작 후기/.test(content) || /학생 감상 초안/.test(content))) return true;
  const kws = keywordsOf(item);
  if (kws.length === 0) return true;
  return kws.some((k) => content.includes(k));
}

/** flowing 단계 중 필수 항목이 안 보이는 곳을 모은다. */
export function findUncoveredFlowingItems(
  sections: { label: string; content: string; requiredItems?: string[] }[]
): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  for (const s of sections) {
    if (!s.requiredItems?.length) continue;
    const missing = s.requiredItems.filter((it) => !itemLooksCovered(s.content, it));
    if (missing.length > 0) gaps.push({ label: s.label, missing });
  }
  return gaps;
}
