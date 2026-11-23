// 코드 펜스(```…```) 밖에만 글 다듬기를 적용한다. alias import 없음 — node:test에서 바로 불러옴.
// 왜: 대괄호·주소·빈 괄호·줄 이음을 지우는 후처리는 산문용이라, 정보 과제 보고서의 파이썬 코드(리스트 `[ ]`, `lower()`,
// `"http://"`, 들여쓰기)를 그대로 망가뜨렸다(2026-11-23 정보 2건 + 재생성 확인).
export function mapOutsideCodeFences(text: string, fn: (prose: string) => string): string {
  if (!text.includes("```")) return fn(text);
  return text
    .split(/(```[\s\S]*?(?:```|$))/g)
    .map((seg, k) => (k % 2 === 1 ? seg : fn(seg)))
    .join("");
}

/** 코드 펜스를 따옴표·괄호가 없는 자리표시로 바꿔 끼우고, 다듬은 뒤 되돌린다 — 위치 계산이 필요한 함수(따옴표 벗기기)용. */
export function maskCodeFences(text: string): { masked: string; restore: (s: string) => string } {
  if (!text.includes("```")) return { masked: text, restore: (s) => s };
  const blocks: string[] = [];
  const masked = text.replace(/```[\s\S]*?(?:```|$)/g, (b) => `\u0001FENCE${blocks.push(b) - 1}\u0001`);
  return { masked, restore: (s) => s.replace(/\u0001FENCE(\d+)\u0001/g, (_m, i: string) => blocks[Number(i)] ?? "") };
}
