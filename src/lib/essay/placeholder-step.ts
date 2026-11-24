// 학생이 채울 빈칸("[직접 작성: …]")뿐인 단계인가.
//
// 왜(2026-11-24, 사용자 국어 책 처방전 + 같은 안내문 재실행 2/2): 2차시 "친구의 고민 분석"은 무작위로 뽑은 친구의 고민 원문이 없어
// 쓸 수 없는 단계다. 코드가 그 단계를 한 줄 빈칸("이 부분은 시험 당일 제시되는 자료가 있어야 답할 수 있어요 …")으로 두었는데,
// 분량 바닥 검사가 "짧다"고 보고 분량 보정이 그 한 줄을 늘려 695자짜리 군더더기 설명문("위 문장에 적힌 대로 현재 원문 자료가
// 없기 때문에 … 틀과 방법을 제시할 수는 있습니다")을 만들었다. 글자 수만 채운 가짜 분량이고 학생이 제출하면 안 되는 글이다.
// 같은 일은 자료가 모자라 빈칸으로 둔 모든 단계(PARTIAL_INSUFFICIENT)에서 생길 수 있다 — 빈칸뿐인 단계는 늘리지 않는다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

const BLANK = /\[(?:직접\s*작성|자료부족)[^\]]*\]/g;

const HAS_BLANK = /\[(?:직접\s*작성|자료부족)/;

/** 빈칸 표시와 소제목·목록 기호를 뺀 뒤 남는 글자 수(공백 제외). */
export function textOutsideBlanks(content: string): number {
  return content
    .replace(BLANK, "")
    .split("\n")
    .filter((l) => !/^\s*#{1,6}\s/.test(l))
    .join("")
    .replace(/[\s*_>`|\-•·]/g, "").length;
}

/**
 * 자료가 없어 못 쓴 단계(시험 당일 제시 자료·수업 중 뽑는 친구의 글 등)의 내용. 필수 항목이 둘 이상이면 항목마다 소제목과 빈칸을 둔다 —
 * 학생이 무엇을 채워야 하는지 보이고 "필수 항목 누락" 경고도 생기지 않는다. 항목이 없으면 한 줄 빈칸.
 */
export function blockedStepContent(items: string[] | undefined, reason: string): string {
  const why = reason.trim() || "자료 필요";
  const head = `이 부분은 시험 당일 제시되는 자료가 있어야 답할 수 있어요 — ${why}`;
  const list = (items ?? []).map((i) => i.trim()).filter(Boolean);
  if (list.length < 2) return `[직접 작성: ${head}]`;
  return list.map((it, i) => `### ${it}\n[직접 작성: ${i === 0 ? head : `${it} — 제시된 자료를 보고 직접 쓰기`}]`).join("\n\n");
}

/** 빈칸이 하나 이상 있고 그 밖의 글이 거의 없으면(40자 미만) 학생이 채울 자리뿐인 단계다. */
export function isPlaceholderStep(content: string): boolean {
  if (process.env.PLACEHOLDER_GUARD === "off") return false;
  if (!HAS_BLANK.test(content)) return false;
  return textOutsideBlanks(content) < 40;
}
