// "참고 도서: 제목 / 저자(지은이)" 칸에 **지어낸 책**이 들어가지 못하게 한다. alias import 없음 — node:test에서 바로 불러옴.
//
// 왜(2026-11-14, 거대 안내문 점검 역사-05): 안내문이 참고 도서의 제목·저자를 칸으로 요구하는데 학생 지침에는 책이 없었다.
// 결과물은 『일제강점기 독립운동 개론서(근현대사 교과서 수준의 입문서)』 / 저자 "지은이 미상"을 적었다 —
// 실제로 있지도 않은 책이고, 학생이 그대로 내면 없는 책을 참고했다고 적어 낸 거짓 기록이다.
// 프롬프트의 "지어내지 말 것"은 이 칸에서 지켜지지 않았다(칸은 채워야 한다는 압력이 더 강하다) — 코드가 직접 비운다.
//
// 책이 **확인된** 경우는 건드리지 않는다: 학생 지침에 그 제목이 있거나, 검색 출처의 제목에 그 제목이 나온 경우.
// 그 밖의 책은(모델이 기억으로 쓴 진짜 책이라도) 학생이 직접 확인해 적도록 빈칸으로 둔다 — 틀린 저자·출판 정보가 나가는 것보다 낫다.

export interface ReferenceContext {
  /** 학생이 지침 칸에 적은 말. 책 제목이 여기 있으면 학생이 정한 책이다. */
  instructions?: string;
  /** 이 글이 실제로 연 검색 출처의 제목들. */
  sourceTitles: string[];
}

const TITLE_HEADING = /^\s*#{2,4}\s*(?:참고\s*)?(?:도서\s*|문헌\s*|자료\s*)?(?:제목|도서명|책\s*이름|책\s*제목)\s*$/;
const AUTHOR_HEADING = /^\s*#{2,4}\s*(?:저자|지은이|글쓴이|작가)(?:\s*\(.*\))?\s*$/;
const ANY_HEADING = /^\s*#{1,4}\s+\S/;
const TITLE_LINE = /^(\s*(?:[-*•]\s*)?[*_]{0,2}(?:참고\s*)?(?:도서\s*|문헌\s*)?(?:제목|도서명|책\s*이름|책\s*제목)[*_]{0,2})\s*[:：]\s*(.*)$/;
const AUTHOR_LINE = /^(\s*(?:[-*•]\s*)?[*_]{0,2}(?:저자|지은이|글쓴이|작가)(?:\s*\(.*?\))?[*_]{0,2})\s*[:：]\s*(.*)$/;

export const BOOK_TITLE_BLANK = "[직접 작성: 참고한 도서 제목]";
export const BOOK_AUTHOR_BLANK = "[직접 작성: 참고한 도서의 저자]";

const UNKNOWN_AUTHOR = /미상|확인할\s*수\s*없|알\s*수\s*없|정보\s*없|알려지지|불명|없음/;
const norm = (s: string) => s.replace(/[\s『』《》「」"'“”‘’()\[\]·,.:;!?-]/g, "").toLowerCase();

/** 칸 값에서 책 제목만 꺼낸다 — 『…』·《…》가 있으면 그 안, 없으면 첫 줄 전체. */
export function bookTitleOf(value: string): string {
  const m = /[『《「]([^』》」]{2,80})[』》」]/.exec(value);
  if (m) return m[1].trim();
  return value.split("\n")[0].replace(/[*_]/g, "").trim();
}

function isVerified(title: string, ctx: ReferenceContext): boolean {
  const key = norm(title);
  if (key.length < 2) return false;
  if (norm(ctx.instructions ?? "").includes(key)) return true;
  return ctx.sourceTitles.some((t) => norm(t).includes(key));
}

function isBlank(value: string): boolean {
  return /\[직접\s*작성/.test(value);
}

export function blankUnverifiedReferenceBook(content: string, ctx: ReferenceContext): { content: string; blanked: string[] } {
  const lines = content.split("\n");
  const blanked: string[] = [];

  // 판정: 제목 값과 저자 값을 보고 둘 다 비워야 하는가
  const shouldBlank = (titleValue: string, authorValue: string): boolean => {
    if (isBlank(titleValue) && isBlank(authorValue)) return false;
    const title = bookTitleOf(titleValue);
    if (!title) return false;
    if (UNKNOWN_AUTHOR.test(authorValue) && !isBlank(authorValue)) return true; // 저자를 모른다고 적은 책은 확인된 책이 아니다
    return !isVerified(title, ctx);
  };

  // 1) 소제목 꼴: "### 제목" 다음 본문, "### 저자(지은이)" 다음 본문
  for (let i = 0; i < lines.length; i++) {
    if (!TITLE_HEADING.test(lines[i])) continue;
    let tEnd = i + 1;
    while (tEnd < lines.length && !ANY_HEADING.test(lines[tEnd])) tEnd++;
    if (tEnd >= lines.length || !AUTHOR_HEADING.test(lines[tEnd])) continue; // 저자 칸이 바로 이어지는 "책 서지 칸"일 때만
    let aEnd = tEnd + 1;
    while (aEnd < lines.length && !ANY_HEADING.test(lines[aEnd])) aEnd++;
    const titleValue = lines.slice(i + 1, tEnd).join("\n").trim();
    const authorValue = lines.slice(tEnd + 1, aEnd).join("\n").trim();
    if (!shouldBlank(titleValue, authorValue)) {
      i = tEnd;
      continue;
    }
    blanked.push(bookTitleOf(titleValue));
    lines.splice(tEnd + 1, aEnd - tEnd - 1, "", BOOK_AUTHOR_BLANK, "");
    lines.splice(i + 1, tEnd - i - 1, "", BOOK_TITLE_BLANK, "");
    i = i + 4; // 방금 쓴 칸을 건너뛴다
  }

  // 2) 이름표 꼴: "제목: …" 다음 몇 줄 안에 "저자(지은이): …"
  for (let i = 0; i < lines.length; i++) {
    const tm = TITLE_LINE.exec(lines[i]);
    if (!tm) continue;
    let j = -1;
    for (let k = i + 1; k <= Math.min(i + 3, lines.length - 1); k++) {
      if (AUTHOR_LINE.test(lines[k])) {
        j = k;
        break;
      }
    }
    if (j < 0) continue;
    const am = AUTHOR_LINE.exec(lines[j])!;
    if (!shouldBlank(tm[2], am[2])) continue;
    blanked.push(bookTitleOf(tm[2]));
    lines[i] = `${tm[1]}: ${BOOK_TITLE_BLANK}`;
    lines[j] = `${am[1]}: ${BOOK_AUTHOR_BLANK}`;
  }

  return { content: lines.join("\n"), blanked };
}
