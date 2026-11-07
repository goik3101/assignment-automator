// 그림으로 내는 칸(만평·광고·삽화)을 **글이 아니라 그릴 수 있는 계획**으로 만든다.
//
// 왜(실측 2026-11-07, 한국사 신문 결과물15와 자체 실행 둘 다): 만평 칸이 두 문단짜리 설명문으로 나왔다.
//   "광복 뒤 한반도에는 38선을 기준으로 … 좌우 대립도 깊어졌다.[2] 1948년 2월 유엔소총회는 …[3]"
// 안내문은 만평 칸을 "글 쓰는 이름표 칸 없이 **그림**을 구성하는 빈 칸"이라고 했고, 채점은
// 비판 대상·주제·특성을 본다. 역할 지시에 "사건을 설명하지 말고 각주도 넣지 말 것"이라고 이미 적혀 있는데
// 모델이 지키지 않는다 — 그래서 코드가 각주를 떼고, 너무 길면 보완하게 표시한다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

const PICTURE_LABEL = /만평|광고|만화|풍자|삽화|컷\s*그림/;

/** 이 칸이 그림으로 내는 칸인가. */
export function isPicturePanel(label: string): boolean {
  return PICTURE_LABEL.test((label ?? "").replace(/\s/g, ""));
}

/**
 * 그림 칸에서 각주를 뗀다. 그림에는 출처를 달 수 없고, 각주가 붙으면 "조사한 글"처럼 보인다.
 * 소제목 줄은 건드리지 않는다.
 */
export function stripPanelCitations(content: string): { content: string; removed: number } {
  const removed = (content.match(/\[\d+\]/g) ?? []).length;
  if (removed === 0) return { content, removed: 0 };
  return { content: content.replace(/\s*\[\d+\]/g, "").replace(/[ \t]{2,}/g, " "), removed };
}

/** 글(소제목·빈 줄 제외)이 몇 자인가. */
export function panelBodyLength(content: string): number {
  return content
    .split("\n")
    .filter((l) => !/^\s*#{1,6}\s/.test(l) && l.trim())
    .join("")
    .replace(/\s/g, "").length;
}

/** 그림 칸이 설명문이 되어 버렸는지 — 그림 한 장 계획으로는 지나치게 길다. */
export function isTooWordy(content: string, max = 450): boolean {
  return panelBodyLength(content) > max;
}

export function panelRepairText(label: string): string {
  return (
    `"${label}"은(는) 그림으로 내는 칸이다. 지금은 사건을 설명하는 글이 되어 있다 — 다음 세 줄로만 다시 쓸 것: ` +
    `(1) 한 줄짜리 제목, (2) "그릴 그림:"으로 시작해 학생이 손으로 그릴 수 있을 만큼 간단한 장면 한두 문장(인물 한둘·배경 하나·글귀 하나), ` +
    `(3) "무엇을 비판하는가:"(광고면 "무엇을 알리는가:")로 시작해 비판 대상과 쟁점을 한두 문장. ` +
    `사건의 배경을 설명하는 문단과 각주는 넣지 말 것 — 배경은 다른 영역이 맡는다.`
  );
}
