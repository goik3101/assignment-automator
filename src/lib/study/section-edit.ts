// 채팅이 "결과물의 ○○ 칸을 고쳐 줘"에 답할 때 쓰는 칸 단위 교체. 모델 호출 없이 문자열만 다룬다(alias import 없음 — 화면·서버·테스트가 같이 씀).
// 칸 = 마크다운 소제목(`##`, `###`…) 하나와 그 아래 글(같거나 더 높은 소제목이 나오기 전까지).
// 소제목 이름이 결과물에서 **딱 하나**로 찾아질 때만 바꾼다 — 애매하면 건드리지 않는다.

export interface SectionSpan {
  level: number;
  /** 소제목 줄 전체("### 인물 배경") */
  headingLine: string;
  title: string;
  start: number;
  end: number;
}

const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*$/;

/** 소제목 이름 비교용: 표시(굵게·번호)와 공백을 지운다. */
export function normHeading(s: string): string {
  return s
    .replace(/[*_`#]/g, "")
    .replace(/^\s*(?:\d+[.)]|[①-⑩]|[가-힣]\.)\s*/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function findSections(md: string): SectionSpan[] {
  const lines = md.split("\n");
  const heads: { level: number; line: string; title: string; start: number }[] = [];
  let pos = 0;
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    // 줄 끝이 CRLF인 글(윈도우에서 저장·복사한 글)도 소제목으로 읽는다. 위치 계산은 원래 줄 길이 그대로.
    const m = !inFence ? HEADING.exec(line.replace(/\r$/, "")) : null;
    if (m) heads.push({ level: m[1].length, line, title: m[2], start: pos });
    pos += line.length + 1;
  }
  return heads.map((h, i) => {
    let end = md.length;
    for (let j = i + 1; j < heads.length; j++) {
      if (heads[j].level <= h.level) {
        end = heads[j].start;
        break;
      }
    }
    return { level: h.level, headingLine: h.line, title: h.title, start: h.start, end };
  });
}

/** 이름이 같은 칸이 하나뿐이면 그 칸, 없거나 여럿이면 null. */
export function findUniqueSection(md: string, heading: string): SectionSpan | null {
  const want = normHeading(heading);
  if (!want) return null;
  const hits = findSections(md).filter((s) => normHeading(s.title) === want);
  return hits.length === 1 ? hits[0] : null;
}

/** 칸의 본문(소제목 줄 제외). 되돌리기용으로 바꾸기 전 글을 돌려줄 때 쓴다. */
export function getSectionBody(md: string, heading: string): string | null {
  const s = findUniqueSection(md, heading);
  if (!s) return null;
  return md.slice(s.start, s.end).split("\n").slice(1).join("\n").trim();
}

/** 새 글의 첫 줄이 소제목이면 떼고 본문만 돌려준다(소제목은 원래 결과물의 것을 그대로 쓴다). */
export function bodyOf(newText: string): string {
  const lines = newText.replace(/\r\n/g, "\n").trim().split("\n");
  if (lines.length && HEADING.test(lines[0])) lines.shift();
  return lines.join("\n").trim();
}

/** 칸을 통째로 바꾼다. 소제목 줄·소제목 단계는 그대로, 아래 글만 교체. 못 찾으면 null. */
export function replaceSection(md: string, heading: string, newText: string): string | null {
  const s = findUniqueSection(md, heading);
  if (!s) return null;
  const body = bodyOf(newText);
  if (!body) return null;
  const old = md.slice(s.start, s.end);
  const tail = /\s*$/.exec(old)?.[0] ?? "";
  // 소제목과 본문 사이의 빈 줄 수도 원래대로(결과물은 보통 "### 제목\n\n본문") — 안 그러면 한 번 고칠 때마다 서식이 달라진다.
  const gap = /^\n+/.exec(old.slice(s.headingLine.length))?.[0] ?? "\n";
  const next = `${s.headingLine}${gap}${body}${tail.includes("\n") ? tail : "\n\n"}`;
  return md.slice(0, s.start) + next + md.slice(s.end);
}

/** 결과물 출처 목록에 없는 각주 번호([7] 등)는 지운다 — 채팅이 지어낸 번호가 출처 없는 인용으로 남지 않게. */
export function stripUnknownFootnotes(text: string, validNumbers: number[]): string {
  const ok = new Set(validNumbers);
  return text.replace(/\s?\[(\d+(?:\s*,\s*\d+)*)\]/g, (m, nums: string) => {
    const kept = nums.split(",").map((n) => Number(n.trim())).filter((n) => ok.has(n));
    if (kept.length === nums.split(",").length) return m;
    return kept.length ? ` [${kept.join(", ")}]` : "";
  });
}

export interface ChatSectionEdit {
  heading: string;
  markdown: string;
}

const EDIT_BLOCK = /```section[ \t]*\n([\s\S]*?)\n?```/;

/**
 * 채팅 답변에서 ```section 블록(= 고친 칸 완성본)을 떼어 낸다. 블록은 첫 줄이 소제목이고, 그 소제목이 결과물에 딱 하나로 있을 때만 수정안으로 인정한다.
 * 인정하지 못하면 블록 표시(```)만 걷어 글은 그대로 보여 준다(수정안 버튼 없이).
 */
export function extractSectionEdit(reply: string, resultText: string): { reply: string; edit?: ChatSectionEdit } {
  const m = EDIT_BLOCK.exec(reply);
  if (!m) return { reply };
  const inner = m[1].replace(/\r\n/g, "\n").trim();
  const first = inner.split("\n")[0] ?? "";
  const h = HEADING.exec(first);
  const rest = reply.replace(EDIT_BLOCK, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!h || !findUniqueSection(resultText, h[2]) || !bodyOf(inner)) {
    return { reply: reply.replace(EDIT_BLOCK, inner).trim() };
  }
  return { reply: rest, edit: { heading: normalizeTitle(h[2]), markdown: bodyOf(inner) } };
}

const normalizeTitle = (t: string) => t.replace(/[*_`]/g, "").trim();
