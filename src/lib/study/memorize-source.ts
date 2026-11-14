// **공부 도구에 "결과물 전체" 대신 "외울 것"을 재료로 준다.**
//
// 왜(2026-11-13 논의, 2026-11-12 실사용): 학생이 받는 과제 중 교실에서 손으로 쓰는 평가는
// 45분에 1,350자를 백지에서 써야 한다. 그러면 외울 수 있는 단위는 글 전체가 아니라
//   ① 칸 순서(무엇을 어떤 순서로 쓰는가) ② 틀리면 감점되는 문장 ③ 그 사이를 잇는 말
// 이다. 그런데 공부 도구는 지금 **결과물 본문 전체**를 재료로 받는다. 그래서 요약의
// `key_terms`에 "멸치: 작은 바닷물고기" 같은 교과서 수준 낱말이 섞이고, 플래시카드도 본문을 잘라 낸다.
//
// 가려내는 기준은 모델 판단이 아니라 **글에 이미 있는 표시**다:
//   - 칸 이름 = 안내문에서 온 `## ` 소제목(분석이 만든 구조 그대로다)
//   - 외울 문장 = **각주([1])가 붙은 문장** — 조사로 확인된 값이라 틀리게 쓰면 감점된다.
//     교과서 수준 일반 지식은 글쓰기가 각주 없이 쓰므로 자동으로 빠진다(그래서 "멸치는 어류다"는 안 들어온다).
//
// 모델 호출이 없다. alias import 없음 — node:test에서 바로 불러옴.

export interface MemorizeSource {
  /** 안내문 칸 이름(쓰는 순서 그대로) */
  boxes: string[];
  /** 각주가 붙은 문장(= 정확히 외워야 하는 것). 각주 번호는 떼고 담는다. */
  anchored: { box: string; sentence: string }[];
}

const H2 = /^##\s+(?!#)(.+?)\s*$/;
const H3 = /^###\s+(?!#)(.+?)\s*$/;
/** 맨 아래 출처 목록·제작 참고는 외울 것이 아니다. */
const NOT_A_BOX = /^(출처|참고\s*자료|참고\s*문헌|제작\s*참고|references?)$/i;

const stripMarks = (s: string) =>
  s
    .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, "")
    .replace(/\*\*|__|\*|_|`/g, "")
    .replace(/<\/?u>/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** 문장 단위로 자른다(한국어 종결어미 + 마침표 기준). */
function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function readMemorizeSource(markdown: string): MemorizeSource {
  const boxes: string[] = [];
  const anchored: { box: string; sentence: string }[] = [];
  let current = "";
  const subBoxes: string[] = [];

  for (const raw of (markdown ?? "").split("\n")) {
    const h = H2.exec(raw.trim());
    if (h) {
      const name = stripMarks(h[1]);
      current = name;
      if (!NOT_A_BOX.test(name.replace(/\s/g, ""))) boxes.push(name);
      continue;
    }
    const h3 = H3.exec(raw.trim());
    if (h3 && current && !NOT_A_BOX.test(current.replace(/\s/g, ""))) {
      const sub = stripMarks(h3[1]);
      if (!NOT_A_BOX.test(sub.replace(/\s/g, ""))) subBoxes.push(sub);
      continue;
    }
    if (!current || NOT_A_BOX.test(current.replace(/\s/g, ""))) continue;
    if (/^\s*\|/.test(raw)) continue; // 표는 통째로 외우는 것이 아니다
    for (const s of sentencesOf(raw)) {
      if (!/\[\d+/.test(s)) continue; // 각주가 붙은 문장만
      const clean = stripMarks(s);
      if (clean.length < 12 || clean.length > 220) continue;
      anchored.push({ box: current, sentence: clean });
    }
  }
  // 단계가 하나뿐이면 "칸"은 단계 이름이 아니라 그 안의 항목(###)이다 — 2026-11-15 역사 인물 평전: 칸 순서가 [1. 역사 인물 평전] 한 줄이라
  // 퀴즈가 "칸 순서 1번 항목의 이름은?"을 냈다.
  const finalBoxes = boxes.length < 2 && subBoxes.length >= 2 ? subBoxes : boxes;
  return { boxes: finalBoxes, anchored };
}

/** 공부 도구 프롬프트에 끼울 블록. 외울 것이 없으면 빈 문자열(그러면 예전처럼 본문만 쓴다). */
export function memorizeBlock(src: MemorizeSource): string {
  if (src.boxes.length < 2 && src.anchored.length === 0) return "";
  const parts: string[] = [];
  // 칸이 하나뿐이면 "순서"가 없다 — 칸 이름만 외울 이유가 없다.
  if (src.boxes.length >= 2) {
    parts.push(
      `[칸 순서 — 학생이 시험지에 이 순서로 쓴다]\n${src.boxes.map((b, i) => `${i + 1}. ${b}`).join("\n")}`
    );
  }
  if (src.anchored.length > 0) {
    parts.push(
      `[외울 문장 — 조사로 확인된 값이라 틀리면 감점된다]\n` +
        src.anchored.slice(0, 12).map((a) => `- (${a.box}) ${a.sentence}`).join("\n")
    );
  }
  return parts.join("\n\n");
}

/** 요약·카드가 **칸 순서를 지키게** 하는 지시 한 줄. */
export function orderInstruction(src: MemorizeSource): string {
  if (src.boxes.length < 2) return "";
  return (
    `요점은 위 [칸 순서] 그대로, 칸마다 한 줄씩 쓴다(${src.boxes.length}줄). ` +
    `글의 논리 순서가 아니라 **학생이 시험지에 쓰는 순서**여야 한다 — 그 목록이 곧 시험장에서 꺼낼 차례표다.`
  );
}

/** 핵심 용어를 어디서 고를지 못 박는 한 줄. */
export function termInstruction(src: MemorizeSource): string {
  if (src.anchored.length === 0) return "";
  return (
    `핵심 용어·개념은 위 [외울 문장]에서 고른다. ` +
    `교과서를 펴면 바로 나오는 일반 상식(예: "멸치는 바닷물고기다")은 넣지 말 것 — ` +
    `시험에서 **틀리게 쓰면 점수를 잃는 것**만 남긴다.`
  );
}
