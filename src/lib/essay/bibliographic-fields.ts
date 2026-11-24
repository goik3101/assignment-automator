// 독서 과제의 **서지 칸**(책 이름·지은이·출판사)은 이름만 적는 칸이다 — 한 문장 넘게 쓴 것을 첫 문장으로 줄이고,
// 모델이 모르는 출판사를 "판권면에서 확인해 적어야 한다"는 안내문으로 때운 칸은 학생이 채울 빈칸으로 되돌린다. alias import 없음.
//
// 왜(2026-11-15, 거대 안내문 점검 국어-01·과학-03): 칸 하나하나를 "항목 = 소제목 + 문단"으로 쓰는 규칙이 서지 칸에도 적용되어
//   "### 출판사\n이 책의 출판사는 빈티지(Vintage)이다.[1] 원서는 2001년에 … 이 활동에서는 책의 내용과 교과 개념을 연결하는 데 초점을 두고, 출판 정보는 …"
//   "### 출판사\n출판사는 내가 읽은 판본의 표지와 판권면에 적힌 이름을 기준으로 해야 한다 … 실제로 읽은 책의 판권면에서 확인해 옮겨 적…"
// 처럼 나왔다 — 칸에 이름 대신 **설명문·작성 요령**이 들어간 것이다(학생이 그대로 내면 어색하고, 뒤의 것은 제출물이 아니라 우리의 안내문이다).
// 프롬프트에 "이름만 적을 것"을 더하는 길 대신 후처리가 줄인다 — 첫 문장이 이름을 말하므로 정보는 잃지 않는다.

// 서지 칸에 더해, 양식에서 **한 줄 칸**인 것도 첫 문장만 남긴다(2026-11-15 가정-02: "역할 설명" 칸이 300자, "주제"가 두 문장).
const FIELD_HEAD = /^(?:책\s*(?:이름|제목)|도서\s*(?:명|제목|이름)|서명|저자|지은이(?:\s*\([^)]*\))?|글쓴이|작가|출판사|출판\s*사항|등장\s*인물|역할\s*설명|인터뷰\s*대상|주제)$/;
const HEAD_LINE = /^(#{2,4})\s+(.+?)\s*$/;
const PUBLISHER_HEAD = /^(?:출판사|출판\s*사항)$/;
/** 출판사 칸에 이름 대신 들어간 "확인해서 적어야 한다" 식 안내. */
const PUBLISHER_META = /판권|표지|판본|직접\s*확인|확인해|확인하여|옮겨\s*적|적어야|밝혀|기준으로/;

/**
 * 이름·값만 적는 칸(책 제목·저자·출판사…)인 항목 이름들.
 *
 * 왜(2026-11-24, 국어 책 처방전 "글자수가 적다"): 글쓰기는 "항목마다 문단으로" 규칙 때문에 책 제목·저자 칸에도 설명 문단을 쓰고, 그 문단은 아래 후처리가
 * 이름 한 줄로 줄인다. 그런데 말해 준 분량(1,300자)에는 그 문단이 들어 있어서 **줄고 나면 약 700자만 남았다**(같은 프롬프트 12회 재생: 값 칸 정리 뒤 중앙 694자).
 * 글쓰기에 "이 칸은 이름 한 줄"이라고 미리 알려 주면 분량이 나머지 항목으로 가서 중앙 961자(+38%)가 남았다. 같은 낱말 목록(FIELD_HEAD)을 후처리와 함께 쓴다.
 */
export function valueFieldItems(items: string[]): string[] {
  return items.filter((i) => FIELD_HEAD.test(i.replace(/\*\*/g, "").trim()));
}

/** 필수 항목 블록에 덧붙일 한 줄 — 값 칸이 없으면 빈 글. VALUE_FIELD_NOTE=off로 끈다. */
export function valueFieldNote(items: string[] | undefined): string {
  if (process.env.VALUE_FIELD_NOTE === "off") return "";
  const names = valueFieldItems(items ?? []);
  if (names.length === 0) return "";
  return `\n  단, ${names.map((n) => `"${n}"`).join("·")} 칸은 이름·값만 한 줄로 쓴다(설명 문단 금지). 단계 분량은 나머지 항목에서 채운다.`;
}

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

// ── 값 칸: "이름·제목·명칭"만 적는 칸에 설명문이 들어갔을 때 ──────────────────────────────────────────────
//
// 왜(2026-11-16, 거대 안내문 8종을 화면 그대로 읽어 본 것): 위 `trimBibliographicFields`는 "두 문장 이상이거나 110자 초과"일 때 **첫 문장**으로 줄인다.
// 그런데 국어-01은 "『하늘과 바람과 별과 시』는 윤동주의 시들을 모은 시집으로, 책장을 넘길 때마다 …"처럼 **문장 하나**로 설명해서 그대로 통과했다.
// 가정-01의 "정책 명칭" 칸은 "효과적인 정책으로 육아휴직을 선택했다. 육아휴직은 …"이 세 문장이었다. 어제 이 규칙을 만든 바로 그 안내문에서 오늘 또 샜다 —
// 규칙이 **관찰한 모양(두 문장)** 에 맞춰져 있었고 "값만 적는다"는 계약에는 맞춰져 있지 않았다.
// 그래서 모양을 더 세는 대신 값만 뽑는다: 칸 이름이 값 칸이고 본문이 값처럼 안 보이면(길거나 서술어로 끝남) 그 칸만 값으로 줄인다(모델 호출은 generate-essay에서).
const VALUE_HEAD =
  /^(?:책\s*(?:이름|제목)|도서\s*(?:명|제목|이름)|서명|저자|지은이(?:\s*\([^)]*\))?|글쓴이|작가|출판사|출판\s*사항|.{0,20}(?:정책|제도|사업)\s*(?:의\s*)?(?:명칭|이름)(?:\s*\([^)]*\))?)$/;

/** 값처럼 안 보이는 칸 본문: 28자를 넘거나 서술하는 문장으로 끝난다. */
function looksLikeDescription(text: string): boolean {
  const t = text.replace(/\[\d+(?:,\s*\d+)*\]/g, "").trim();
  if (!t || /^\[직접\s*작성/.test(t)) return false;
  return t.length > 28 || /[가-힣]다[.。]\s*$/.test(t) || /(?:이며|이고|입니다|습니다)[.。]?\s*$/.test(t);
}

export function findValueFieldOverflows(content: string): { name: string; text: string }[] {
  const lines = content.split("\n");
  const out: { name: string; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].match(HEAD_LINE);
    const name = head?.[2].replace(/\*\*/g, "").trim() ?? "";
    if (!head || !VALUE_HEAD.test(name)) continue;
    let j = i + 1;
    const body: string[] = [];
    while (j < lines.length && !HEAD_LINE.test(lines[j])) body.push(lines[j++]);
    const text = body.join(" ").replace(/\s+/g, " ").trim();
    if (looksLikeDescription(text)) out.push({ name, text });
  }
  return out;
}

/** 값 칸 본문을 바꾼다(소제목 줄은 그대로). values: 칸 이름 → 새 본문. */
export function replaceValueFields(content: string, values: Map<string, string>): string {
  const lines = content.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const head = lines[i].match(HEAD_LINE);
    const name = head?.[2].replace(/\*\*/g, "").trim() ?? "";
    out.push(lines[i]);
    if (!head || !VALUE_HEAD.test(name) || !values.has(name)) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < lines.length && !HEAD_LINE.test(lines[j])) j++;
    out.push("", values.get(name)!, "");
    i = j;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

// ── 같은 결과물의 다른 단계에 이미 나온 책으로 서지 빈칸을 채운다 ─────────────────────────────────────────
// 2026-11-16 사용자 테스트(국어 책 처방전): "책 처방전" 칸의 책 제목·저자가 "[직접 작성: 참고한 도서 제목]"으로 비어 있는데,
// 같은 결과물의 요약과 편지에는 "수전 케인의 『콰이어트: …』"가 이미 적혀 있었다. 책 처방전 칸이 거의 빈 채(인용구 한 줄)로 나가 "뒤지게 짧다"가 됐다.
// 책을 새로 정하지 않는다 — **이 결과물 안에 이미 있는 책**을 칸으로 옮길 뿐이다.
export function findBookInTexts(texts: string[]): { title: string; author?: string } | null {
  const joined = texts.join("\n");
  const withAuthor = /([가-힣A-Za-z·]{2,12}(?:\s[가-힣A-Za-z·]{1,8})?)(?:의|이\s*쓴|가\s*쓴)\s*[『《]([^』》\n]{2,60})[』》]/.exec(joined);
  if (withAuthor) return { author: withAuthor[1].trim(), title: withAuthor[2].trim() };
  const only = /[『《]([^』》\n]{2,60})[』》]/.exec(joined);
  return only ? { title: only[1].trim() } : null;
}

const BOOK_TITLE_HEAD = /^(?:책\s*(?:이름|제목)|도서\s*(?:명|제목|이름)|서명)$/;
const BOOK_AUTHOR_HEAD = /^(?:저자|지은이(?:\s*\([^)]*\))?|글쓴이|작가)$/;

export function fillBookBlanks(content: string, book: { title: string; author?: string }): { content: string; filled: string[] } {
  const lines = content.split("\n");
  const out: string[] = [];
  const filled: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const head = lines[i].match(HEAD_LINE);
    const name = head?.[2].replace(/\*\*/g, "").trim() ?? "";
    out.push(lines[i]);
    const isTitle = !!head && BOOK_TITLE_HEAD.test(name);
    const isAuthor = !!head && BOOK_AUTHOR_HEAD.test(name);
    if (!isTitle && !isAuthor) {
      i++;
      continue;
    }
    let j = i + 1;
    const body: string[] = [];
    while (j < lines.length && !HEAD_LINE.test(lines[j])) body.push(lines[j++]);
    const text = body.join(" ").trim();
    const value = isTitle ? `『${book.title}』` : book.author;
    if (/\[직접\s*작성/.test(text) && value) {
      out.push("", value, "");
      filled.push(name);
    } else {
      out.push(...body);
    }
    i = j;
  }
  return { content: out.join("\n").replace(/\n{3,}/g, "\n\n"), filled };
}
