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

// ───────────────────────────────────────────────────────────────────────────────────────────────
// 안내문 문구가 문단 머리 라벨로 새는 것을 뗀다 (2026-11-15, 10종 직접 대조 — 가정-01·역사-03·사회-02·과학-12에서 반복).
//   "### 정책 설명" 아래 "대상과 방법을 포함한 정책 설명: 돌봄교실은 …", "이 필요한 정책 한 가지를 골라 정책 명칭: 돌봄교실",
//   "고대 국가의 문화유산을 국가에 맞게 선정하고: 백제의 …", "평가 및 기대효과에는 실행 가능성: …" —
// 모델이 채점 기준·작성 요령 문장을 **그대로 라벨처럼 베껴** 본문 앞에 붙인다. 학생이 옮겨 적으면 선생님 채점표 문장이 답안에 적힌다.
// 두 가지로 가린다: ① 소제목 바로 아래 줄의 머리말이 그 소제목의 낱말을 **전부** 담고 있으면(소제목을 풀어 다시 말한 것)
// ② 머리말 낱말의 80% 이상이 **안내문 낱말**이고 3낱말 이상이면(안내문 문구를 베낀 것). 머리말이 문장 끝맺음(다·요)이면 건드리지 않는다.

const stem = (t: string) => t.replace(/(?:으로|에서|에게|까지|부터|와|과|의|을|를|은|는|이|가|에|도|및|하고|하여|한|하는)$/, "");
const toks = (s: string): string[] =>
  s
    .replace(/[^0-9A-Za-z가-힣\s]/g, " ")
    .split(/\s+/)
    .map(stem)
    .filter((t) => t.length >= 2);

export function stripNoticeEcho(content: string, noticeText: string): { content: string; stripped: string[] } {
  const vocab = new Set(toks(noticeText));
  const lines = content.split("\n");
  const stripped: string[] = [];
  let heading: string[] | null = null;
  let firstBodyLine = false;
  const out = lines.map((line) => {
    const h = /^#{2,4}\s+(.+?)\s*$/.exec(line);
    if (h) {
      heading = toks(h[1].replace(/\*\*/g, ""));
      firstBodyLine = true;
      return line;
    }
    if (!line.trim()) return line;
    if (/^\s*(?:#|\||>)/.test(line)) return line;
    const m = /^(\s*(?:[-*•]\s+)?)([^:：\n]{4,45}?)\s*[:：]\s+(\S[\s\S]*)$/.exec(line);
    const wasFirst = firstBodyLine;
    firstBodyLine = false;
    if (!m) return line;
    const prefix = m[2].replace(/\*\*/g, "").trim();
    const rest = m[3];
    if (/(?:다|요|까|니다|\.)$/.test(prefix)) return line; // 문장 끝맺음이면 라벨이 아니다
    if (/[\[\]]/.test(prefix)) return line; // 대괄호 빈칸의 콜론은 라벨 콜론이 아니다
    if (rest.replace(/\[\d+\]/g, "").trim().length < 15) return line;
    const pt = toks(prefix);
    if (pt.length === 0) return line;
    const underHeading = wasFirst && heading && heading.length > 0 && heading.every((t) => pt.some((p) => p.includes(t) || t.includes(p))) && pt.length > heading.length;
    const fromNotice = pt.length >= 3 && pt.filter((t) => vocab.has(t)).length / pt.length >= 0.8;
    if (!underHeading && !fromNotice) return line;
    stripped.push(prefix);
    return `${m[1]}${rest}`;
  });
  return { content: out.join("\n"), stripped };
}

/**
 * 같은 줄 **한가운데**에 끼어든 안내문 문구 라벨도 뗀다("…육아휴직을 골랐다. 가정 양립 정책 한 가지를 고르고: 육아휴직은 …").
 * 문장 끝(. ! ?) 바로 뒤에서 시작하는 "머리말: "만 보고, 머리말의 낱말 80% 이상이 안내문 낱말이며 3낱말 이상일 때만 뗀다.
 */
export function stripInlineNoticeEcho(content: string, noticeText: string): { content: string; stripped: string[] } {
  const vocab = new Set(toks(noticeText));
  const stripped: string[] = [];
  const out = content.split("\n").map((line) => {
    if (/^\s*(?:#|\||>)/.test(line)) return line;
    return line.replace(/([.!?]\s+)([^:：.!?\n]{6,45}?)\s*[:：]\s+(?=\S)/g, (m, lead: string, prefix: string) => {
      const p = prefix.replace(/\*\*/g, "").trim();
      if (/(?:다|요|까|니다)$/.test(p)) return m;
      // 대괄호 빈칸("[직접 작성: 날짜]")의 콜론을 라벨 콜론으로 읽으면 빈칸 머리를 잘라 "날짜]이다"처럼 깨진다(2026-11-19 히든 피겨스).
      if (/[\[\]]/.test(p)) return m;
      const pt = toks(p);
      if (pt.length < 3 || pt.filter((t) => vocab.has(t)).length / pt.length < 0.8) return m;
      stripped.push(p);
      return lead;
    });
  });
  return { content: out.join("\n"), stripped };
}
