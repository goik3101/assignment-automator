// 학생이 **실물을 붙이는 칸**(출력한 신문 기사 등)의 서지 정보를 AI가 지어내지 못하게 한다.
//
// 왜(실측 2026-11-03, 통합사회2 평가지): 기사 스크랩 칸이 이렇게 나왔다.
//   제목: [직접 작성: 기사 제목]      ← 맞게 빈칸
//   날짜: 2025년 1월 2일              ← 지어냄
//   출처: 서울신문                    ← 지어냄
// 학생이 그대로 내면 실제로 붙인 기사와 다른 날짜·신문사를 적어 낸 셈이다 — 거짓 기록이다.
// 프롬프트로 한 번 말해도 모델이 한 칸만 지키는 일이 반복돼, 코드가 직접 비운다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

/** 우리가 "여기에 실물을 붙여라"라고 표시한 자리. 이 표시가 있는 단계에서만 작동한다. */
const PASTE_MARK = /\[붙일 자료:/;
/** 붙인 실물에서 그대로 옮겨 적어야 하는 서지 항목 — 학생만 알 수 있다. */
const META_LABEL = /^(\s*(?:[-*•]\s*)?(?:기사\s*)?(?:제목|날짜|작성일|보도일|신문사|언론사|출처|기자|작성자|발행처|발행일))\s*[:：]\s*(.+)$/;
/** 이미 빈칸이면 건드리지 않는다. */
const ALREADY_BLANK = /\[(?:직접\s*작성|붙일\s*자료)[^\]]*\]|^[_\s]*$|^\(\s*\)$/;

export interface BlankedMeta {
  label: string;
  was: string;
}

/**
 * 붙이는 칸의 서지 줄에 값이 적혀 있으면 빈칸으로 되돌린다.
 * 그 단계에 붙임 표시가 없으면 아무것도 하지 않는다(실험 날짜 등 정당한 값을 지우지 않기 위해).
 */
export function blankPastedMetadata(content: string): { content: string; blanked: BlankedMeta[] } {
  if (!PASTE_MARK.test(content)) return { content, blanked: [] };
  const blanked: BlankedMeta[] = [];
  const out = content
    .split("\n")
    .map((line) => {
      const m = META_LABEL.exec(line);
      if (!m) return line;
      const value = m[2].trim();
      if (!value || ALREADY_BLANK.test(value)) return line;
      const label = m[1].replace(/^[\s\-*•]+/, "").trim();
      blanked.push({ label, was: value.slice(0, 40) });
      return `${m[1]}: [직접 작성: 붙인 기사의 ${label}]`;
    })
    .join("\n");
  return { content: out, blanked };
}
