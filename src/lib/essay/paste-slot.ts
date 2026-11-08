// 학생이 **실물을 붙이는 칸**(출력한 신문 기사 등)의 서지 정보를 AI가 지어내지 못하게 한다.
//
// 왜(실측 2026-11-03, 통합사회2 평가지): 기사 스크랩 칸이 이렇게 나왔다.
//   제목: [직접 작성: 기사 제목]      ← 맞게 빈칸
//   날짜: 2025년 1월 2일              ← 지어냄
//   출처: 서울신문                    ← 지어냄
// 학생이 그대로 내면 실제로 붙인 기사와 다른 날짜·신문사를 적어 낸 셈이다 — 거짓 기록이다.
// 프롬프트로 한 번 말해도 모델이 한 칸만 지키는 일이 반복돼, 코드가 직접 비운다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

/**
 * 우리가 "여기에 실물을 붙여라"라고 표시한 자리. 이 표시가 있는 단계에서만 작동한다.
 *
 * 대괄호를 **반드시 요구하면 안 된다**(실측 2026-11-09, 사회 평가지 정답 채점 5/6):
 * 프롬프트는 `[붙일 자료: 기사 본문 …]`으로 두라고 하는데, 우리 후처리가 짝 안 맞는 대괄호를 정리하면서
 * (`이상한 대괄호 정리함` 로그) 괄호가 떨어져 `붙일 자료: 기사 본문 …`이 된다. 그러면 이 관문이 꺼져
 * **지어낸 기사 날짜·신문사가 그대로 나갔다**("날짜: 2024년 9월 23일", "출처: 연합뉴스").
 */
const PASTE_MARK = /(?:^|\n)\s*(?:[-*•]\s*)?[*_]{0,2}\[?\s*붙일\s*자료\s*[:：]/;
/** 붙인 실물에서 그대로 옮겨 적어야 하는 서지 항목 — 학생만 알 수 있다. */
// 칸 이름 앞에 꾸밈말이 붙는다 — "기사 제목"만 보다가 "**보도 날짜**: 2026년 6월 9일"을 놓쳤다
// (실측 2026-11-09: 제목·출처는 빈칸이 됐는데 날짜만 지어낸 값이 남아 정답 채점 5/6).
const META_LABEL =
  /^(\s*(?:[-*•]\s*)?[*_]{0,2}(?:기사|보도|발행|작성|취재|게재)?\s*(?:제목|날짜|일자|작성일|보도일|게재일|신문사|언론사|매체|출처|기자|작성자|발행처|발행일)[*_]{0,2})\s*[:：]\s*(.+)$/;
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
export function blankPastedMetadata(
  content: string,
  opts: { force?: boolean } = {}
): { content: string; blanked: BlankedMeta[] } {
  if (!opts.force && !PASTE_MARK.test(content)) return { content, blanked: [] };
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

/**
 * **붙임 칸을 코드가 바로잡는다.** 모델 보완에 맡기면 더 나빠지는 것이 실측됐다(2026-11-09, 사회 평가지):
 * 거절문을 고치라고 했더니 그 칸을 통째로 사용자에게 말을 거는 글로 바꿨다 —
 * "[이데일리 기사 원문이 제공되지 않아 … 링크나 원문을 보내 주시면 … 정리해 드릴 수 있습니다.]"
 * 게다가 그 과정에서 `붙일 자료:` 표시가 사라져 위의 서지 비우기 관문까지 꺼지고 "출처: 이데일리"가 남았다.
 *
 * 그래서 붙이는 단계에서는 코드가 ① 서지 값을 비우고(표시가 없어도 `force`) ② 거절문 줄을 지우고
 * ③ 붙임 표시가 없으면 다시 적는다. 모델 호출이 없으니 시간 예산과 무관하다.
 */
export function normalizeAttachmentSlot(
  content: string,
  findRefusals: (text: string) => string[]
): { content: string; blanked: BlankedMeta[]; droppedRefusals: string[] } {
  const { content: blankedText, blanked } = blankPastedMetadata(content, { force: true });
  const refusals = findRefusals(blankedText);
  let out = blankedText;
  for (const r of refusals) out = out.split(r).join("");
  out = out
    .split("\n")
    // 거절문만 있던 줄은 괄호·여는 대괄호만 남는다
    .filter((line) => !/^[\s[\](){}*_—-]*$/.test(line) || line.trim() === "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!PASTE_MARK.test(`\n${out}`)) out += `\n\n붙일 자료: 기사 본문 — 출력해서 붙일 것, 기사 위에 아무것도 쓰지 말 것`;
  return { content: out, blanked, droppedRefusals: refusals };
}
