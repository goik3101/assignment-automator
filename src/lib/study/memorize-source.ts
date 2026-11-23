// **결과물에서 "칸 순서"를 읽는다.** 가상 시험의 작성 조건(칸 목록)과 요약의 칸 계획(box-plan.ts이 못 정하는 때의 대체)이 쓴다.
//
// 왜(2026-11-12 실사용): 손으로 쓰는 평가는 45분에 1,350자를 백지에서 쓴다. 외울 수 있는 단위는 글 전체가 아니라 칸 순서와 칸마다의 핵심어다.
// 칸 이름 = 안내문에서 온 `## ` 소제목(분석이 만든 구조 그대로), 단계 아래 항목 = `### ` 소제목.
// (2026-11-23: 각주 붙은 문장을 "외울 문장"으로 뽑던 부분은 지웠다 — 쓰던 퀴즈·플래시카드 생성이 없어지면서 아무도 읽지 않았다.)
//
// 모델 호출이 없다. alias import 없음 — node:test에서 바로 불러옴.

export interface MemorizeSource {
  /** 안내문 칸 이름(쓰는 순서 그대로) */
  boxes: string[];
  /** 단계(##)와 그 아래 항목(###). "개요 > 글의 목적·예상 독자…"처럼 이름 있는 항목이 둘 이상이면 요약이 항목 단위로 쓴다. */
  outline: { box: string; items: string[] }[];
}

const H2 = /^##\s+(?!#)(.+?)\s*$/;
const H3 = /^###\s+(?!#)(.+?)\s*$/;
/** 맨 아래 출처 목록·제작 참고는 외울 것이 아니다. */
export const NOT_A_BOX = /^(출처|참고\s*자료|참고\s*문헌|제작\s*참고|references?)$/i;

const stripMarks = (s: string) =>
  s
    .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, "")
    .replace(/\*\*|__|\*|_|`/g, "")
    .replace(/<\/?u>/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function readMemorizeSource(markdown: string): MemorizeSource {
  const boxes: string[] = [];
  let current = "";
  const subBoxes: string[] = [];
  const outline: { box: string; items: string[] }[] = [];

  for (const raw of (markdown ?? "").split("\n")) {
    const h = H2.exec(raw.trim());
    if (h) {
      const name = stripMarks(h[1]);
      current = name;
      if (!NOT_A_BOX.test(name.replace(/\s/g, ""))) {
        boxes.push(name);
        outline.push({ box: name, items: [] });
      }
      continue;
    }
    const h3 = H3.exec(raw.trim());
    if (h3 && current && !NOT_A_BOX.test(current.replace(/\s/g, ""))) {
      const sub = stripMarks(h3[1]);
      if (!NOT_A_BOX.test(sub.replace(/\s/g, ""))) {
        subBoxes.push(sub);
        outline[outline.length - 1]?.items.push(sub);
      }
    }
  }
  // 단계가 하나뿐이면 "칸"은 단계 이름이 아니라 그 안의 항목(###)이다 — 2026-11-15 역사 인물 평전: 칸 순서가 [1. 역사 인물 평전] 한 줄이라
  // 퀴즈가 "칸 순서 1번 항목의 이름은?"을 냈다.
  const finalBoxes = boxes.length < 2 && subBoxes.length >= 2 ? subBoxes : boxes;
  return { boxes: finalBoxes, outline };
}

/** 단계 아래에 항목(###)이 둘 이상 있는 단계가 있는가. */
export const hasNamedItems = (src: MemorizeSource) => src.outline.some((g) => g.items.length >= 2);

/** 프롬프트에 끼울 "칸 순서" 블록. 칸이 하나뿐이면 순서가 없으니 빈 문자열(그러면 본문만 쓴다). */
export function memorizeBlock(src: MemorizeSource): string {
  if (src.boxes.length < 2) return "";
  return `[칸 순서 — 학생이 시험지에 이 순서로 쓴다]\n${src.boxes.map((b, i) => `${i + 1}. ${b}`).join("\n")}`;
}
