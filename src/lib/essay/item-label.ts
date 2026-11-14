// 소제목 없이 **하나의 글로 이어 쓰는 단계**(items_format === "flowing")에서, 우리가 프롬프트에 적어 준 항목 이름이
// 문단 머리의 "항목: …" 꼴 라벨로 그대로 묻어 나온 것을 코드가 뗀다. alias import 없음.
//
// 왜(2026-11-15, 거대 안내문 점검 역사-01): 논술문 단계는 "다룰 항목: 국제 정세 / 배경 및 전개 / 경위 / 입장 …"으로 안내했고,
// 모델이 문단마다 "태평양 전쟁 당시의 국제 정세와 전쟁의 배경: 일본은 …", "전개: 태평양 전쟁은 …"처럼 **항목 이름을 라벨로**
// 붙여 냈다. 소제목도 줄글도 아닌 어정쩡한 모양이라 학생이 그대로 내면 논술이 항목 나열처럼 읽힌다.
// 프롬프트로 "라벨을 붙이지 말라"고 하는 길 대신 후처리가 뗀다. 라벨 뒤에 실제 글이 남을 때만, 항목 이름과 **낱말이 겹치는**
// 짧은 앞머리만 뗀다 — "예를 들어:" 같은 일반 말머리나 칸 이름표("제목: …")는 건드리지 않는다.

const FIELD_LABEL = /^(?:제목|이름|학번|날짜|일시|작성자|부제|주제|학년|반|번호)$/;

const tokens = (s: string): string[] =>
  s
    .replace(/[^0-9A-Za-z가-힣\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/(?:으로|에서|에게|까지|부터|와|과|의|을|를|은|는|이|가|에|도|및)$/, ""))
    .filter((t) => t.length >= 2);

export function stripFlowingItemLabels(content: string, items: string[]): { content: string; stripped: string[] } {
  const itemTokens = tokens(items.join(" "));
  if (itemTokens.length === 0) return { content, stripped: [] };
  const stripped: string[] = [];
  const lines = content.split("\n").map((line) => {
    if (/^\s*(?:#|\|)/.test(line)) return line;
    const m = line.match(/^(\s*(?:[-*•]\s+)?)(?:\*\*)?([^:：\n.!?。]{2,45}?)(?:\*\*)?\s*[:：]\s+(\S[\s\S]*)$/);
    if (!m) return line;
    const label = m[2].trim();
    if (FIELD_LABEL.test(label)) return line;
    const rest = m[3];
    if (rest.replace(/\[\d+\]/g, "").trim().length < 15) return line; // 라벨 뒤에 글이 거의 없으면 칸 이름표다
    const lt = tokens(label);
    if (lt.length === 0) return line;
    const hit = lt.filter((t) => itemTokens.some((it) => it.includes(t) || t.includes(it))).length;
    if (hit / lt.length < 0.7) return line;
    stripped.push(label);
    return `${m[1]}${rest}`;
  });
  return { content: lines.join("\n"), stripped };
}
