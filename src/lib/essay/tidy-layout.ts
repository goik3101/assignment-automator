// 글의 **줄 모양**을 코드로 바로잡는다. alias import 없음 — node:test에서 바로 불러옴.
//
// 1) 문장 중간에서 줄이 끊긴 글을 한 문단으로 잇는다 (2026-11-15 과학-12): 양식 칸 줄 수("약 5줄")를 읽은 모델이
//    "체육 교사가 되면 학생들에게 운동 기능뿐 아니라 ⏎ 경기에서 일어나는 현상의 원리도 …"처럼 **문장 한가운데서 줄을 바꿔** 썼다.
//    학생이 옮겨 적는 글이 아니라 화면에 보이는 글이므로 줄바꿈은 문단 사이에만 있어야 한다.
// 2) 같은 소제목이 한 단계 안에 두 번 나오고 내용이 거의 같으면 뒤쪽을 지운다 (2026-11-15 수학-02: "본인이 제일 중요하게 생각한 점"이 세 번).

/** 연속한 짧은 줄이 문장 끝맺음 없이 이어지면 한 문단으로 합친다. */
export function unwrapHardBreaks(content: string): { content: string; joined: number } {
  const lines = content.split("\n");
  const out: string[] = [];
  let joined = 0;
  let i = 0;
  const isSpecial = (l: string) => /^\s*(?:#|\||>|[-*•]\s|\d+[.)]\s)/.test(l);
  while (i < lines.length) {
    if (!lines[i].trim() || isSpecial(lines[i])) {
      out.push(lines[i++]);
      continue;
    }
    let j = i;
    while (j < lines.length && lines[j].trim() && !isSpecial(lines[j])) j++;
    const block = lines.slice(i, j);
    const body = block.slice(0, -1);
    const unfinished = body.filter((l) => !/[.!?。”"')\]다요]\s*(?:\[\d+(?:,\s*\d+)*\])*\s*$/.test(l.trim())).length;
    if (block.length >= 3 && body.length > 0 && unfinished / body.length >= 0.6 && block.every((l) => l.trim().length <= 80)) {
      out.push(block.map((l) => l.trim()).join(" "));
      joined += block.length - 1;
    } else {
      out.push(...block);
    }
    i = j;
  }
  return { content: out.join("\n"), joined };
}

const bigrams = (s: string) => {
  const t = s.replace(/[\s\[\]\d.,]/g, "");
  const set = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
};
const jaccard = (a: string, b: string) => {
  const A = bigrams(a), B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / (A.size + B.size - n);
};

/** 같은 소제목이 두 번이고 본문이 닮았으면 뒤쪽 소제목+본문을 지운다. */
export function dropDuplicateHeadings(content: string): { content: string; dropped: string[] } {
  const lines = content.split("\n");
  const heads = lines.map((l, i) => (/^#{2,4}\s+\S/.test(l) ? i : -1)).filter((i) => i >= 0);
  const key = (i: number) => lines[i].replace(/^#+\s*/, "").replace(/[\s*]/g, "");
  const bodyOf = (k: number) => lines.slice(heads[k] + 1, k + 1 < heads.length ? heads[k + 1] : lines.length).join("\n");
  const drop = new Set<number>();
  const dropped: string[] = [];
  for (let a = 0; a < heads.length; a++) {
    if (drop.has(a)) continue;
    for (let b = a + 1; b < heads.length; b++) {
      if (drop.has(b) || key(heads[a]) !== key(heads[b])) continue;
      if (jaccard(bodyOf(a), bodyOf(b)) >= 0.3) {
        drop.add(b);
        dropped.push(lines[heads[b]].replace(/^#+\s*/, ""));
      }
    }
  }
  if (drop.size === 0) return { content, dropped };
  const kill = new Set<number>();
  for (const b of drop) for (let l = heads[b]; l < (b + 1 < heads.length ? heads[b + 1] : lines.length); l++) kill.add(l);
  return { content: lines.filter((_, i) => !kill.has(i)).join("\n").replace(/\n{3,}/g, "\n\n"), dropped };
}

/**
 * 번호가 붙은 소제목이 **내용 없이 곧바로 또 다른 번호 소제목**으로 이어지면 앞쪽(빈 것)을 지운다.
 * 왜(2026-11-15 가정-02, 사진을 직접 읽은 작성자): "### 컷 1" 바로 아래 "### 장면 1"이 나와 칸 이름이 두 번 찍혔다.
 * 번호가 없는 소제목(빈 기입란 "### 제목" 등)은 건드리지 않는다.
 */
export function dropEmptyNumberedHeading(content: string): { content: string; dropped: string[] } {
  const lines = content.split("\n");
  const dropped: string[] = [];
  const out: string[] = [];
  const numbered = (l: string) => /^#{2,4}\s+.*\d/.test(l);
  for (let i = 0; i < lines.length; i++) {
    if (numbered(lines[i])) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      // 자리표시 번호 소제목("문항 1"·"컷 2")은 뒤에 어떤 소제목이 와도, 또는 글 끝이어도 내용이 없으면 지운다(2026-11-16 가정-03: "### 문항 1" 바로 아래 "### 의사소통의 종류").
      const placeholder = /^#{2,4}\s+(?:칸|컷|장면|문항|문제)\s*\d+\s*$/.test(lines[i]);
      const nextIsHeading = j < lines.length && /^#{2,4}\s/.test(lines[j]);
      if (placeholder && (nextIsHeading || j >= lines.length)) {
        dropped.push(lines[i].replace(/^#+\s*/, ""));
        continue;
      }
      if (j < lines.length && numbered(lines[j]) && lines[j].match(/^#+/)![0] === lines[i].match(/^#+/)![0]) {
        dropped.push(lines[i].replace(/^#+\s*/, ""));
        continue;
      }
    }
    out.push(lines[i]);
  }
  return { content: out.join("\n"), dropped };
}

/**
 * 채점 문구를 괄호로 베껴 쓴 꼬리("… 결과물이다(출토지·형태 설명).")를 뗀다.
 *
 * 왜(2026-11-16 역사-03): 논술 본문에 "(출토지·형태 설명)"처럼 **안내문의 작성 요령을 그대로 괄호에 단 말**이 남았다.
 * 학생 글이 아니라 모델이 "이 칸은 이 요령에 따라 썼다"고 표시한 것이다. 괄호 안이 '설명·근거·서술·제시'로 끝나고
 * 숫자·각주가 없는 짧은 말일 때만 뗀다("(투조: 뚫어 만든 무늬)" 같은 뜻풀이는 그대로 둔다).
 */
export function stripCriterionParens(content: string): { content: string; removed: string[] } {
  const removed: string[] = [];
  const out = content.replace(/[ \t]*\(([^()\n\d\[\]:：]{2,24}?(?:설명|근거|서술|제시))\)/g, (_m, inner: string) => {
    removed.push(inner);
    return "";
  });
  return { content: out, removed };
}
