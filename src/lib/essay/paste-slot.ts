// 학생이 **실물을 붙이는 칸**(출력한 신문 기사 등)의 서지 정보를 AI가 지어내지 못하게 한다.
//
// 왜(실측 2026-11-03, 통합사회2 평가지): 기사 스크랩 칸이 이렇게 나왔다.
//   제목: [직접 작성: 기사 제목]      ← 맞게 빈칸
//   날짜: 2025년 1월 2일              ← 지어냄
//   출처: 서울신문                    ← 지어냄
// 학생이 그대로 내면 실제로 붙인 기사와 다른 날짜·신문사를 적어 낸 셈이다 — 거짓 기록이다.
// 프롬프트로 한 번 말해도 모델이 한 칸만 지키는 일이 반복돼, 코드가 직접 비운다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

/**
 * 우리가 "여기에 실물을 붙여라"라고 표시한 자리. 이 표시가 있는 단계에서만 작동한다.
 *
 * 대괄호를 **반드시 요구하면 안 된다**(실측 2026-11-09, 사회 평가지 정답 채점 5/6):
 * 프롬프트는 `[붙일 자료: 기사 본문 …]`으로 두라고 하는데, 우리 후처리가 짝 안 맞는 대괄호를 정리하면서
 * (`이상한 대괄호 정리함` 로그) 괄호가 떨어져 `붙일 자료: 기사 본문 …`이 된다. 그러면 이 관문이 꺼져
 * **지어낸 기사 날짜·신문사가 그대로 나갔다**("날짜: 2024년 9월 23일", "출처: 연합뉴스").
 */
const PASTE_MARK = /(?:^|\n)\s*(?:[-*•]\s*)?[*_]{0,2}\[?\s*붙일\s*자료\s*[:：]/;
/** 붙인 실물에서 그대로 옮겨 적어야 하는 서지 항목 — 학생만 알 수 있다. */
// 칸 이름 앞에 꾸밈말이 붙는다 — "기사 제목"만 보다가 "**보도 날짜**: 2026년 6월 9일"을 놓쳤다
// (실측 2026-11-09: 제목·출처는 빈칸이 됐는데 날짜만 지어낸 값이 남아 정답 채점 5/6).
const META_LABEL =
  /^(\s*(?:[-*•]\s*)?[*_]{0,2}(?:기사|보도|발행|작성|취재|게재)?\s*(?:제목|날짜|일자|작성일|보도일|게재일|신문사|언론사|매체|출처|기자|작성자|발행처|발행일)s*(?:명|란|칸)?[*_]{0,2})\s*[:：]\s*(.+)$/;
/**
 * `[신문사명]`처럼 **대괄호만 씌운 자리표시**는 값도 빈칸도 아니다 — 학생이 무엇을 적어야 하는지 모른다.
 * 실측(2026-11-14, 사회 평가지 3/6): `신문사명: [신문사명]`이 그대로 나가 서지 조건이 떨어졌다.
 */
const BARE_PLACEHOLDER = /^\[[^\]]{1,20}\]$/;

/**
 * **서지 칸을 한 줄에 몰아 쓴 꼴**도 쪼갠다 — "제목·보도 날짜·출처: 출력한 기사에 표시된 …".
 *
 * 왜(2026-11-14, 두 번째 실측): 라벨을 하나씩만 보는 규칙을 고치자 모델이 라벨을 **합쳐서** 썼다.
 * 그 줄은 값도 빈칸도 아니라 학생이 무엇을 어디에 적을지 알 수 없다. 칸마다 한 줄씩으로 펼친다.
 */
const META_WORDS = ["제목", "보도 날짜", "날짜", "신문사", "언론사", "매체", "출처", "기자", "발행처"];
function splitCombinedMetaLine(line: string): string[] | null {
  const m = /^(\s*)([^:：\n]{2,40})\s*[:：]\s*(.*)$/.exec(line);
  if (!m) return null;
  const label = m[2];
  // 구분자로 이어 붙인 라벨만 본다("제목·보도 날짜·출처"). 문장은 건드리지 않는다.
  if (!/[·,/、]|\s와\s|\s과\s/.test(label)) return null;
  const found = META_WORDS.filter((w) => label.includes(w));
  // "보도 날짜"와 "날짜"가 같이 잡히면 긴 쪽만 남긴다.
  const words = found.filter((w) => !found.some((o) => o !== w && o.includes(w)));
  if (words.length < 2) return null;
  return words.map((w) => `${m[1]}${w}: [직접 작성: 붙인 기사의 ${w}]`);
}

/** 이미 빈칸이면 건드리지 않는다. */
const ALREADY_BLANK = /\[(?:직접\s*작성|붙일\s*자료)[^\]]*\]|^[_\s]*$|^\(\s*\)$/;

export interface BlankedMeta {
  label: string;
  was: string;
}

/**
 * 붙이는 칸의 서지 줄에 값이 적혀 있으면 빈칸으로 되돌린다.
 * 그 단계에 붙임 표시가 없으면 아무것도 하지 않는다(실험 날짜 등 정당한 값을 지우지 않기 위해).
 */
export function blankPastedMetadata(
  content: string,
  opts: { force?: boolean } = {}
): { content: string; blanked: BlankedMeta[] } {
  if (!opts.force && !PASTE_MARK.test(content)) return { content, blanked: [] };
  const blanked: BlankedMeta[] = [];
  const blankedCombined: string[] = [];
  const out = content
    .split("\n")
    // 합쳐 쓴 서지 줄을 먼저 칸마다 한 줄로 펼친다.
    .flatMap((line) => {
      const split = splitCombinedMetaLine(line);
      if (!split) return [line];
      for (const w of split) blankedCombined.push(w.split(":")[0].trim());
      return split;
    })
    .map((line) => {
      const m = META_LABEL.exec(line);
      if (!m) return line;
      const value = m[2].trim();
      // 제대로 된 빈칸(`[직접 작성: …]`·빈 줄·`( )`)만 그대로 둔다.
      // 값이든 `[신문사명]` 같은 자리표시든 나머지는 전부 빈칸으로 바꾼다 — 학생이 적을 자리이기 때문이다.
      if (!value || (ALREADY_BLANK.test(value) && !BARE_PLACEHOLDER.test(value.replace(/\[(?:직접\s*작성|붙일\s*자료)[^\]]*\]/, "x")))) return line;
      const label = m[1].replace(/^[\s\-*•]+/, "").trim();
      blanked.push({ label, was: value.slice(0, 40) });
      return `${m[1]}: [직접 작성: 붙인 기사의 ${label}]`;
    })
    .join("\n");
  for (const label of blankedCombined) blanked.push({ label, was: "(합쳐 쓴 서지 줄)" });
  return { content: out, blanked };
}

/**
 * **붙임 칸을 코드가 바로잡는다.** 모델 보완에 맡기면 더 나빠지는 것이 실측됐다(2026-11-09, 사회 평가지):
 * 거절문을 고치라고 했더니 그 칸을 통째로 사용자에게 말을 거는 글로 바꿨다 —
 * "[이데일리 기사 원문이 제공되지 않아 … 링크나 원문을 보내 주시면 … 정리해 드릴 수 있습니다.]"
 * 게다가 그 과정에서 `붙일 자료:` 표시가 사라져 위의 서지 비우기 관문까지 꺼지고 "출처: 이데일리"가 남았다.
 *
 * 그래서 붙이는 단계에서는 코드가 ① 서지 값을 비우고(표시가 없어도 `force`) ② 거절문 줄을 지우고
 * ③ 붙임 표시가 없으면 다시 적는다. 모델 호출이 없으니 시간 예산과 무관하다.
 */
export function normalizeAttachmentSlot(
  content: string,
  findRefusals: (text: string) => string[]
): { content: string; blanked: BlankedMeta[]; droppedRefusals: string[] } {
  const { content: blankedText, blanked } = blankPastedMetadata(content, { force: true });
  const refusals = findRefusals(blankedText);
  let out = blankedText;
  for (const r of refusals) out = out.split(r).join("");
  out = out
    .split("\n")
    // 거절문만 있던 줄은 괄호·여는 대괄호만 남는다
    .filter((line) => !/^[\s[\](){}*_—-]*$/.test(line) || line.trim() === "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // 모델이 쓴 "붙일 자료" 줄이 **기사 위에 적으라고** 시키는 경우가 있다 — 안내문이 "신문기사에 그 어떤 글자도
  // 기재하지 않음"이라고 못 박은 과제에서 그대로 나갔다(2026-11-14 실측, 사회 평가지 3/6):
  //   "붙일 자료: 위에 제목·보도 날짜·신문사명을 표시한 신문 기사 원문 전체."
  // 서지는 **위 칸에** 적는 것이지 기사에 적는 것이 아니므로, 그런 줄은 우리 문구로 바꾼다.
  // 어순이 뒤집힌 꼴도 잡아야 한다 — 실제로 나온 문장은 "위에 …을 **표시한** 신문 기사 원문"이었다.
  // 그래서 낱말 순서를 보지 않고, 붙일 자료 줄에 "표시/기재"가 있으면 우리 문구로 바꾼다(우리 문구엔 없다).
  const WRITE_ON_ARTICLE = /표시|기재|적어\s*넣|써\s*넣/;
  const SAFE_PASTE_LINE = "붙일 자료: 기사 본문 — 출력해서 붙일 것, 기사 위에 아무것도 쓰지 말 것";
  out = out
    .split("\n")
    .map((line) => (PASTE_MARK.test(`\n${line}`) && WRITE_ON_ARTICLE.test(line) ? SAFE_PASTE_LINE : line))
    .join("\n");
  if (!PASTE_MARK.test(`\n${out}`)) out += `\n\n${SAFE_PASTE_LINE}`;
  return { content: out, blanked, droppedRefusals: refusals };
}
