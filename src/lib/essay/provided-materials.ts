// 안내문에 **실려 있는 자료**(기사·지문·제시문·통계표)를 글쓰기에 전한다. alias import 없음 — node:test에서 바로 불러옴.
//
// 왜(2026-11-11, 사회 "경제적 유인" 정답 채점 2/8): 안내문 1면에 신문 기사 두 개가 그대로 인쇄돼 있고
// 1번 문항이 "**위 사례**를 읽고 표를 채우세요"다. 그런데 분석은 할 일만 뽑고 기사 내용을 버렸고
// (12%·40%·정책형·노쇼·위약금·적금 — 분석 결과에 하나도 없었다), 생성은 "위 사례"가 뭔지 몰라
// 검색으로 때웠다(조사 쿼리가 "학교 급식 잔반"이었다). 결과물의 사례가 안내문과 **전혀 다른 것**이 됐다.
//
// 지문·자료가 실린 과제는 흔하다(국어 지문, 사회 기사·통계, 영어 지문, 과학 실험 데이터).
// 그런 과제에서 **자료가 곧 소재**이고, 검색은 보조일 뿐이다.

export function hasProvidedMaterials(materials: string[] | undefined): boolean {
  return (materials ?? []).some((m) => m.trim().length >= 20);
}

/** 글쓰기 프롬프트에 넣을 블록. 자료가 없으면 빈 문자열. */
export function providedMaterialsBlock(materials: string[] | undefined): string {
  const list = (materials ?? []).map((m) => m.trim()).filter((m) => m.length >= 20);
  if (list.length === 0) return "";
  return (
    `\n【안내문이 실어 준 자료 — 이것이 이 과제의 재료다】 학생은 **이 자료를 읽고** 쓴다.\n` +
    list.map((m, i) => `(자료 ${i + 1}) ${m}`).join("\n") +
    `\n- 과제가 "위 사례", "제시문", "아래 자료"라고 말하면 **그것은 위 자료다.** 다른 소재를 가져오거나 지어내지 말 것.\n` +
    `- 숫자·날짜·기관 이름은 위 자료에 적힌 그대로 쓸 것(검색으로 찾은 다른 값으로 바꾸지 말 것).\n` +
    `- 위 자료만으로 모자라는 설명은 교과 지식으로 채우되, 소재 자체를 바꾸지는 말 것.\n`
  );
}

/** 조사(검색)에 넘길 한 줄 — 무엇을 다루는 과제인지 알려 엉뚱한 소재로 검색하지 않게 한다. */
export function researchFocusLine(materials: string[] | undefined): string {
  const list = (materials ?? []).map((m) => m.trim()).filter((m) => m.length >= 20);
  if (list.length === 0) return "";
  const heads = list.map((m) => m.slice(0, 70).replace(/\s+/g, " ")).join(" / ");
  return (
    `\n**이 과제는 안내문에 실린 자료를 읽고 쓰는 과제다.** 자료의 소재는 다음과 같다: ${heads}\n` +
    `검색은 그 소재를 벗어나지 말 것 — 다른 사례를 찾아오면 과제와 무관한 글이 된다.\n`
  );
}
