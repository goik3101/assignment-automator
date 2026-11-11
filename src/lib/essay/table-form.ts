// 안내문 양식이 **표**인 칸을 표로 쓰게 한다.
//
// 왜(2026-11-11 측정, 사회 "경제적 유인" 1번 + 수학 "분석적 채점 기준표"): 우리는 안내문의 양식을
// **한 종류(소제목 목록)로만** 다뤘다. `required_items`에 칸 이름이 들어오면 그것을 전부 "소제목"으로 읽고
// 분량도 "항목당 대여섯 문장"으로 준다. 그래서 양식이 표인 칸이 오면:
//   - 사회 "사례 분석표"(사례 2줄 × 열 4개)가 **소제목 10개 × 대여섯 문장**의 산문 3,000자가 됐고,
//   - 수학 "분석적 채점 기준표"(안내문이 열 이름까지 적어 준다)가 **표 줄 0개**인 1,104자 산문이 됐다.
// 학생은 종이 양식의 표를 채워야 하는데 산문 덩어리를 받는다 — 그 칸 점수를 통째로 잃는다.
// 표 양식은 흔하다(비교표·분석표·관찰 기록표·채점 기준표). 안내문마다 규칙을 더하지 않으려면
// "열(column)과 소제목(section)은 다르다"를 코드가 알아야 한다.
//
// alias import 없음 — node:test에서 바로 불러올 수 있게.

export interface TableElement {
  label: string;
  description?: string;
  required_items?: string[];
}

/** "발표·대표·목표"처럼 낱말 끝의 '표'가 표가 아닌 것들. */
const NOT_TABLE = /(발표|대표|목표|투표|지표|좌표|상표|우표|명함표?|시간표)$/;

/** 단계 이름 자체가 표인가 — "사례 분석표", "분석적 채점 기준표", "비교표". */
export function labelIsTable(label: string): boolean {
  const l = (label ?? "").replace(/\s/g, "").replace(/[)\]】>]+$/, "");
  if (!/표$/.test(l) || l.length < 3) return false;
  return !NOT_TABLE.test(l);
}

/** 안내문이 "표 칸"·"표로 정리"·"표 형태로"라고 말했는가. 낱말 속 '표'(이름표 칸·발표 형식)에 걸리지 않게 앞을 묶는다. */
const TABLE_WORD = /(?:^|[\s(·,:：'"‘“])표\s*(?:칸|형태|형식|양식)|(?:^|[\s(·,:：'"‘“])표\s*(?:로|에|안에)\s*(?:정리|작성|기록|채[우워]|만들|나타|제시|적어|옮겨)/;

const GENERIC_WORD = /^(?:작성|제출|활동|내용|자료|단계|과제|결과|글|및|또는|양식|칸)$/;
function mentionsLabel(label: string, text: string): boolean {
  const flat = text.replace(/\s/g, "");
  const whole = label.replace(/\s/g, "");
  if (whole.length >= 2 && flat.includes(whole)) return true;
  const words = label.split(/[\s·/,()]+/).filter((w) => w.length >= 2 && !GENERIC_WORD.test(w));
  return words.length > 0 && words.every((w) => flat.includes(w));
}

const splitSentences = (text: string) => (text ?? "").split(/(?<=[.。!?])\s+|\n+/);

/** 이 단계의 양식이 표인가. 단계 이름 + 그 단계를 가리키는 작성 기준 문장만 본다. */
export function isTableForm(el: TableElement, guide?: string): boolean {
  if (labelIsTable(el.label)) return true;
  if (TABLE_WORD.test(`${el.label} ${el.description ?? ""}`)) return true;
  return splitSentences(guide ?? "").some((s) => TABLE_WORD.test(s) && mentionsLabel(el.label, s));
}

/**
 * 분석이 표를 **1차원으로 펼친** 경우를 되접는다: "사례1-해결해야 할 행동", "사례1-예상되는 변화",
 * "사례2-해결해야 할 행동" … 처럼 `<줄>-<열>` 꼴로 들어온다(실측 2026-11-11 사회: 항목 10개).
 * 되접지 않으면 **열이 10개인 표**가 나온다 — 안내문 양식은 열 5개 × 줄 2개다.
 */
function foldFlattened(items: string[]): { rows: string[]; columns: string[] } | null {
  const parts = items.map((raw) => {
    const m = /^([가-힣A-Za-z]{1,6}\s*[0-9①-⑩])\s*[-–—:：.)]\s*(.+)$/.exec(raw.trim());
    return m ? { row: m[1].replace(/\s/g, ""), col: m[2].trim() } : null;
  });
  if (parts.some((p) => !p)) return null;
  const rows = [...new Set(parts.map((p) => p!.row))];
  const columns = [...new Set(parts.map((p) => p!.col))];
  if (rows.length < 2 || columns.length < 2) return null;
  return { rows, columns };
}

/** 마지막 줄로 들어가는 합계 칸(열이 아니다). */
const TOTAL_ROW = /^(?:합계|총점|총\s*계|계)$/;

/**
 * 표의 **열 이름**. 분석이 뽑은 칸 이름이 1순위다(안내문에 인쇄된 그대로 들어온다).
 * 없으면 작성 기준의 `‘A / B / C’` 꼴 목록에서 읽는다.
 */
export function tableColumns(el: TableElement, guide?: string): string[] {
  const items = (el.required_items ?? []).map((s) => s.trim()).filter(Boolean);
  const folded = foldFlattened(items);
  if (folded) return folded.columns;
  const cols = items.filter((i) => !TOTAL_ROW.test(i.replace(/\s/g, "")));
  if (cols.length >= 2) return cols;
  for (const s of splitSentences(guide ?? "")) {
    if (!mentionsLabel(el.label, s)) continue;
    const quoted = s.match(/[‘'"“]([^’'"”]{2,60})[’'"”]/g) ?? [];
    for (const q of quoted) {
      const inner = q.slice(1, -1);
      if (!inner.includes("/")) continue;
      const parts = inner.split("/").map((p) => p.trim()).filter((p) => p.length >= 2);
      if (parts.length >= 2) return parts.filter((p) => !TOTAL_ROW.test(p.replace(/\s/g, "")));
    }
  }
  return cols;
}

/** 합계 줄을 요구하는가. */
export function wantsTotalRow(el: TableElement, guide?: string): boolean {
  if ((el.required_items ?? []).some((i) => TOTAL_ROW.test(i.replace(/\s/g, "")))) return true;
  return splitSentences(guide ?? "").some((s) => mentionsLabel(el.label, s) && /마지막에\s*[‘'"“]?(?:합계|총점)/.test(s));
}

/**
 * 표의 **줄 이름**. "사례1·사례2 각각 … 칸으로 구성"처럼 안내문이 줄을 못 박은 경우만 읽는다.
 * (못 박지 않았으면 몇 줄인지는 글쓰기가 소재에 맞춰 정한다.)
 */
export function tableRowLabels(el: TableElement, guide?: string, requirements: string[] = []): string[] {
  const folded = foldFlattened((el.required_items ?? []).map((s) => s.trim()).filter(Boolean));
  if (folded) return folded.rows;
  for (const s of [...splitSentences(guide ?? ""), ...requirements]) {
    if (guide && !requirements.includes(s) && !mentionsLabel(el.label, s)) continue;
    const m = s.match(/([가-힣A-Za-z]{1,6}\s*[①-⑩\d])\s*[·,]\s*([가-힣A-Za-z]{1,6}\s*[①-⑩\d])\s*(?:각각|모두|둘\s*다)/);
    if (m) return [m[1].replace(/\s/g, ""), m[2].replace(/\s/g, "")];
  }
  return [];
}

export interface TableSpec {
  label: string;
  columns: string[];
  rows: string[];
  total: boolean;
}

export function tableSpecs(elements: TableElement[], guide?: string, requirements: string[] = []): TableSpec[] {
  return elements
    .filter((el) => isTableForm(el, guide))
    .map((el) => ({
      label: el.label,
      columns: tableColumns(el, guide),
      rows: tableRowLabels(el, guide, requirements),
      total: wantsTotalRow(el, guide),
    }))
    .filter((t) => t.columns.length >= 2);
}

/** 표 한 칸에 들어갈 글자 수(한두 문장). 분량 역할 `table`이 이 값을 쓴다. */
export const PER_CELL_MIN = 55;
export const PER_CELL_MAX = 150;
/** 안내문이 줄 수를 안 밝혔을 때 가정하는 줄 수. */
export const DEFAULT_ROWS = 3;

export function tableCellCount(spec: TableSpec): number {
  const rows = spec.rows.length >= 1 ? spec.rows.length : DEFAULT_ROWS;
  return Math.max(2, spec.columns.length) * rows;
}

/** 생성 프롬프트에 넣을 지시. 표 칸이 없으면 빈 문자열. */
export function tableFormBlock(specs: TableSpec[]): string {
  if (specs.length === 0) return "";
  const body = specs
    .map((t) => {
      const head = `| ${t.columns.join(" | ")} |`;
      const sep = `| ${t.columns.map(() => "---").join(" | ")} |`;
      const rows = (t.rows.length ? t.rows : ["(줄 1)", "(줄 2)"])
        .map((r) => `| ${t.columns.map((_, i) => (i === 0 ? r : "…")).join(" | ")} |`)
        .join("\n");
      return (
        `"${t.label}" 칸은 안내문 양식이 **표**다. 아래 열을 머리줄로 하는 마크다운 표 **한 개**로만 쓸 것:\n` +
        `${head}\n${sep}\n${rows}\n` +
        (t.rows.length ? `줄은 ${t.rows.join("·")}로 하고, ` : "") +
        (t.total ? `마지막 줄에 "합계"를 넣고, ` : "") +
        `한 칸에는 한두 문장만 적는다(열 이름을 "### 소제목"으로 만들어 문단으로 풀어 쓰지 말 것). 조사로 확인한 사실을 쓴 칸에는 각주 번호를 칸 안에 그대로 붙인다.`
      );
    })
    .join("\n\n");
  return `\n【표 양식 칸 — 반드시 지킬 것】\n${body}\n표 바깥에 같은 내용을 다시 산문으로 적지 말 것. 학생은 이 표를 종이 양식에 그대로 옮겨 적는다.\n`;
}

/** 단계별 호출에 붙일 한 줄(그 단계가 표일 때만). */
export function tableStepLine(label: string, specs: TableSpec[]): string {
  const t = specs.find((s) => s.label === label);
  if (!t) return "";
  return `표: **이 칸은 표다** — 열 ${t.columns.map((c) => `"${c}"`).join(" | ")}를 머리줄로 하는 마크다운 표 한 개로만 쓴다(소제목·문단 금지).\n`;
}

export function tableFormRepairText(label: string, spec: TableSpec | undefined): string {
  const cols = spec?.columns ?? [];
  return (
    `"${label}" 칸은 안내문 양식이 표인데 표로 쓰지 않았다(지금은 소제목과 문단으로 풀어 썼다). ` +
    `이미 쓴 내용을 그대로 써서 ${cols.length ? `열이 ${cols.map((c) => `"${c}"`).join(" | ")}인 ` : ""}마크다운 표 한 개로 바꿀 것 — ` +
    `머리줄, "| --- |" 구분줄, 줄마다 값. 한 칸은 한두 문장으로 줄이고, 표 바깥의 같은 설명은 지운다. ` +
    `새 사실을 만들지 말고 각주 번호는 그대로 둔다.`
  );
}
