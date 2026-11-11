// 안내문 **원문 전사**의 표 구조에서 양식 칸 이름을 읽는다 — 분석이 흘린 칸을 되찾기 위한 것이다.
//
// 왜(2026-11-11): 안내문을 읽는 규칙 190여 개가 전부 analyze의 **요약**(core_task_info)만 읽는다.
// 요약이 흘린 것은 그 아래 어디서도 복구되지 않으므로, 새 안내문이 올 때마다 "이번엔 무엇이 사라졌나"가 된다.
// 사회 "경제적 유인"의 2번 양식은 칸이 6개인데 분석이 5개로 잡았고(실행마다 흔들린다), 그 결과
// '두 유인을 결합하거나 보완한 최적의 정책 제시' 칸이 통째로 빠진 글이 나왔다 — 정답 채점 2점 손실.
//
// 그런데 **원문 전사는 그 양식을 표 그대로 옮겨 적는다**:
//   | 기획한 경제적 유인의 한계점 … | ___ |
//   | 위에서 분석한 결과를 바탕으로 두 유인을 결합하거나 보완한 최적의 정책 제시 | ___ |
// 저장된 안내문 10종으로 재 보니 표가 전사된 것은 이 한 종뿐이었고(나머지는 표 양식이 아니다),
// 그 한 종에서 흘린 칸 1개를 정확히 되찾았다. 표가 없으면 아무것도 바꾸지 않으므로 다른 과제에 영향이 없다.
//
// **원문 전사를 생성 프롬프트에 넣는 것과는 다르다** — 그쪽은 기각됐다(배점·일시·부정행위 안내가 들어간다).
// 여기서는 코드가 읽고 **칸 이름만** 분석 결과에 되돌려 놓는다.
//
// alias import 없음 — node:test에서 바로 불러올 수 있게.

const PLACEHOLDER = /^[_\s.·…―—\-]*$/;
const isBlank = (c: string) => !c || PLACEHOLDER.test(c);
/** "긍정적 유인: ___"처럼 **이름이 붙은 빈칸**. 값이 아니라 칸이므로 빈칸으로 센다. */
const NAMED_BLANK = /^([^:：]{2,30})\s*[:：]\s*[_\s.·…―—\-]*$/;

function cellsOf(line: string): string[] {
  return line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

const clean = (s: string) =>
  s.replace(/^[①-⑩\d]+\s*[).]?\s*/, "").replace(/\s+/g, " ").trim();

export interface NoticeForm {
  /** 표의 열 이름(머리줄이 있는 표) */
  columns: string[];
  /** 표의 줄 이름(머리줄이 있는 표의 첫 열 값 — 칸 이름이 아니라 **줄**이다) */
  rowLabels: string[];
  /** 한 줄에 "이름 | 빈칸" 꼴로 놓인 칸 이름들 */
  fields: string[];
}

/**
 * 전사된 글에서 표를 하나씩 읽는다. 표마다 머리줄이 있으면 그 칸들은 **열**이고 첫 열 값은 **줄**이며,
 * 머리줄이 없으면 각 줄의 첫 칸이 **칸 이름**이다(학교 양식지가 거의 이 꼴이다).
 */
export function readNoticeForms(noticeText: string | undefined): NoticeForm {
  const columns: string[] = [];
  const rowLabels: string[] = [];
  const fields: string[] = [];
  let header: string[] | null = null;
  let inTable = false;

  for (const raw of (noticeText ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("|")) {
      header = null;
      inTable = false;
      continue;
    }
    const cs = cellsOf(line);
    if (cs.length < 2) continue;
    if (/^[\s:|-]+$/.test(line.replace(/\|/g, ""))) continue; // 구분줄
    const filled = cs.filter((c) => !isBlank(c));

    // 머리줄: 첫 칸이 비어 있고 나머지가 모두 이름인 줄(양식지 표의 전형)
    if (!inTable && isBlank(cs[0]) && filled.length >= 2) {
      header = cs.slice(1).filter((c) => !isBlank(c)).map(clean);
      columns.push(...header);
      inTable = true;
      continue;
    }
    inTable = true;

    if (isBlank(cs[0])) continue;
    const name = clean(cs[0]);
    if (name.length < 2 || name.length > 60) continue;
    const rest = cs.slice(1);
    const restFilled = rest.filter((c) => !isBlank(c) && !NAMED_BLANK.test(c));
    const namedBlanks = rest.map((c) => NAMED_BLANK.exec(c)?.[1]).filter((x): x is string => !!x);

    if (header) {
      // 머리줄이 있는 표의 첫 칸은 줄 이름이다(사례1·사례2).
      rowLabels.push(name);
      continue;
    }
    // 값 칸이 비어 있으면(학생이 채울 칸) 첫 칸은 칸 이름이다.
    if (restFilled.length <= Math.max(0, rest.length - 1)) {
      fields.push(name);
      // "긍정적 유인: ___ | 부정적 유인: ___"처럼 값 칸이 또 하위 칸인 경우
      for (const nb of namedBlanks) fields.push(clean(nb));
    }
  }

  const uniq = (xs: string[]) => [...new Set(xs)];
  return { columns: uniq(columns), rowLabels: uniq(rowLabels), fields: uniq(fields) };
}

const words = (s: string) => (s.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []).map((w) => w.toLowerCase());

/** 같은 칸인가 — 글자 포함이 아니라 **낱말 겹침**으로 본다(guide-fields.ts와 같은 이유). */
export function sameField(a: string, b: string): boolean {
  const aw = words(a);
  const bw = new Set(words(b));
  if (aw.length === 0) return false;
  return aw.filter((w) => bw.has(w)).length / aw.length >= 0.6;
}

export interface FormStep {
  label: string;
  required_items?: string[];
}

/**
 * 원문 양식의 칸 중 **분석이 흘린 것**을 단계마다 되돌려 준다.
 * 어느 단계의 칸인지는 원문에 적힌 **순서**로 가린다 — 앞뒤 칸이 이미 들어 있는 단계에 붙인다.
 * (이름만 보고 고르면 "예상되는 행동의 변화"처럼 두 양식에 같은 칸이 있는 안내문에서 엉뚱한 데 붙는다.)
 */
export function recoverFormFields(steps: FormStep[], noticeText: string | undefined): string[][] {
  const { columns, fields } = readNoticeForms(noticeText);
  const ordered = [...columns, ...fields];
  const result: string[][] = steps.map((s) => [...(s.required_items ?? [])]);
  if (ordered.length === 0) return result;

  // 원문 칸마다 "이미 가지고 있는 단계"를 적는다.
  const owner = ordered.map((f) => steps.findIndex((s) => (s.required_items ?? []).some((i) => sameField(f, i))));
  for (let i = 0; i < ordered.length; i++) {
    if (owner[i] >= 0) continue;
    let at = -1;
    for (let d = 1; d < ordered.length && at < 0; d++) {
      if (owner[i - d] !== undefined && owner[i - d] >= 0) at = owner[i - d];
      else if (owner[i + d] !== undefined && owner[i + d] >= 0) at = owner[i + d];
    }
    if (at < 0) continue; // 어느 단계인지 가릴 수 없으면 손대지 않는다
    if (result[at].some((i2) => sameField(ordered[i], i2))) continue;
    result[at].push(ordered[i]);
    owner[i] = at;
  }
  return result;
}
