// 부분 보완(모델이 한 단계를 다시 쓰는 호출)이 소제목 줄바꿈을 지우고 돌려준 글을 바로잡는다. alias import 없음 — node:test에서 바로 불러옴.
//
// 왜(2026-11-14, 거대 안내문 점검 수학-01): 보완 결과가 "### 교과서에서 … 문제 교과서에서 의미 있다고 … ### 작성한 문제의 풀이 (2x+1)^6을 …"처럼
// **소제목 네 개가 본문 한 줄에 이어 붙어** 나왔다. 보완 결과를 채택하는 검사에 줄 구조를 보는 것이 없었다.
// 원문이 소제목을 줄 처음에 두었는데 보완본에서는 줄 중간에 `###`가 나오면, 줄 처음으로 되돌린다.

/** 줄 중간에 붙은 `##`~`####` 소제목 표시를 줄 처음으로 옮긴다. 원문에 줄 처음 소제목이 없으면 건드리지 않는다. */
export function restoreHeadingBreaks(original: string, repaired: string): { content: string; fixed: number } {
  if (!/^\s*#{2,4}\s+\S/m.test(original)) return { content: repaired, fixed: 0 };
  let fixed = 0;
  // 앞이 줄바꿈·'#'이 아닌 글자이고 `### 글자` 꼴일 때만 — "C# 언어", 수식의 '#'은 뒤에 공백+글자가 이어지지 않거나 2개 미만이라 걸리지 않는다.
  const content = repaired.replace(/([^\n#])[ \t]*(#{2,4})[ \t]+(?=\S)/g, (_m, before: string, hashes: string) => {
    fixed++;
    return `${before}\n\n${hashes} `;
  });
  return { content, fixed };
}
