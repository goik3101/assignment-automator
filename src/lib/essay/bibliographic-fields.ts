// 독서 과제의 **서지 칸**(책 이름·지은이·출판사)은 이름만 적는 칸이다 — 한 문장 넘게 쓴 것을 첫 문장으로 줄이고,
// 모델이 모르는 출판사를 "판권면에서 확인해 적어야 한다"는 안내문으로 때운 칸은 학생이 채울 빈칸으로 되돌린다. alias import 없음.
//
// 왜(2026-11-15, 거대 안내문 점검 국어-01·과학-03): 칸 하나하나를 "항목 = 소제목 + 문단"으로 쓰는 규칙이 서지 칸에도 적용되어
//   "### 출판사\n이 책의 출판사는 빈티지(Vintage)이다.[1] 원서는 2001년에 … 이 활동에서는 책의 내용과 교과 개념을 연결하는 데 초점을 두고, 출판 정보는 …"
//   "### 출판사\n출판사는 내가 읽은 판본의 표지와 판권면에 적힌 이름을 기준으로 해야 한다 … 실제로 읽은 책의 판권면에서 확인해 옮겨 적…"
// 처럼 나왔다 — 칸에 이름 대신 **설명문·작성 요령**이 들어간 것이다(학생이 그대로 내면 어색하고, 뒤의 것은 제출물이 아니라 우리의 안내문이다).
// 프롬프트에 "이름만 적을 것"을 더하는 길 대신 후처리가 줄인다 — 첫 문장이 이름을 말하므로 정보는 잃지 않는다.

const FIELD_HEAD = /^(?:책\s*(?:이름|제목)|도서\s*(?:명|제목|이름)|서명|저자|지은이(?:\s*\([^)]*\))?|글쓴이|작가|출판사|출판\s*사항)$/;
const HEAD_LINE = /^(#{2,4})\s+(.+?)\s*$/;
const PUBLISHER_HEAD = /^(?:출판사|출판\s*사항)$/;
/** 출판사 칸에 이름 대신 들어간 "확인해서 적어야 한다" 식 안내. */
const PUBLISHER_META = /판권|표지|판본|직접\s*확인|확인해|확인하여|옮겨\s*적|적어야|밝혀|기준으로/;

/** 첫 문장(뒤따르는 각주까지)만 남긴다. 문장이 하나뿐이면 그대로. */
function firstSentence(text: string): string {
  const m = text.match(/^[\s\S]*?[.!?。](?:\[\d+(?:,\s*\d+)*\])*(?=\s|$)/);
  return (m ? m[0] : text).trim();
}

export function trimBibliographicFields(content: string): { content: string; trimmed: string[] } {
  const lines = content.split("\n");
  const trimmed: string[] = [];
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const head = lines[i].match(HEAD_LINE);
    const name = head?.[2].replace(/\*\*/g, "").trim() ?? "";
    if (!head || !FIELD_HEAD.test(name)) {
      out.push(lines[i]);
      i++;
      continue;
    }
    out.push(lines[i]);
    let j = i + 1;
    const body: string[] = [];
    while (j < lines.length && !HEAD_LINE.test(lines[j])) body.push(lines[j++]);
    const text = body.join(" ").replace(/\s+/g, " ").trim();
    let next = text;
    if (PUBLISHER_HEAD.test(name) && text && !/\[\d+\]/.test(text) && PUBLISHER_META.test(text)) {
      next = "[직접 작성: 출판사 — 읽은 책의 판권면에서 확인]";
    } else if (text.length > 110 || (text.match(/[.!?。](?:\[\d+(?:,\s*\d+)*\])*\s+\S/g) ?? []).length >= 1) {
      next = firstSentence(text);
    }
    if (next !== text && next) {
      trimmed.push(name);
      out.push("", next, "");
    } else {
      out.push(...body);
    }
    i = j;
  }
  return { content: out.join("\n").replace(/\n{3,}/g, "\n\n"), trimmed };
}
