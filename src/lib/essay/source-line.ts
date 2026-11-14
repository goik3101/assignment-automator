// 글 맨 끝의 "자료 출처:" 줄이 **채울 값이 없다는 표시**("제목·저자(또는 출처 URL) 미기재")로 나오면, 시스템이 확인한 실제 출처로 채운다. alias import 없음.
//
// 왜(2026-11-15, 거대 안내문 점검 역사-02): 안내문이 "자료 출처를 기재"하라고 했고 모델은 검색으로 얻은 출처의 제목·주소를 모르는 채
//   "자료 출처: [1] 제목·저자(또는 출처 URL) 미기재; [2] 제목·저자(또는 출처 URL) 미기재."로 마무리했다 — 학생이 그대로 내면 작업 메모가 제출물에 실린다.
// 주소를 모델에게 짓게 하지 않는 것이 이 프로젝트의 원칙이므로(출처 목록 항목은 코드가 채운다) 이 줄도 코드가 확인된 출처로 바꾼다.

const SOURCE_LABEL = /^\s*(?:\*\*)?(?:자료\s*)?(?:출처|참고\s*문헌|참고\s*자료)(?:\*\*)?\s*[:：]/;
const PLACEHOLDER = /미기재|제목[·,]\s*저자|\(또는\s*출처|확인\s*필요|추후\s*(?:기재|확인)|출처\s*없음/;

export interface SourceLike {
  n: number;
  title: string;
  url: string;
}

/** 마지막 문단이 값 없는 출처 줄이면 인용된 확인 출처로 바꾼다. 인용된 출처가 없으면 그 줄을 지운다(작업 메모가 남지 않게). */
export function fillPlaceholderSourceLine(content: string, sources: SourceLike[]): { content: string; replaced: boolean } {
  const paras = content.replace(/\s+$/, "").split(/\n{2,}/);
  const last = paras[paras.length - 1] ?? "";
  if (!SOURCE_LABEL.test(last) || !PLACEHOLDER.test(last)) return { content, replaced: false };
  const label = last.match(SOURCE_LABEL)![0].replace(/[*:：]/g, "").trim() || "자료 출처";
  const cited = new Set([...content.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const list = sources.filter((s) => cited.has(s.n) && s.url);
  const head = paras.slice(0, -1);
  if (list.length === 0) return { content: head.join("\n\n"), replaced: true };
  const lines = list.map((s) => `- ${s.title?.trim() || s.url}: ${s.url}`);
  return { content: [...head, `${label}:\n${lines.join("\n")}`].join("\n\n"), replaced: true };
}
