// 안내문이 표·그래프를 요구하면 글 안에 실제로 만들게 한다.
// 실측(2026-10-29, 사용자 제출 직전 결과물): "아래 그래프는 2011~2023년 노인 상대적 빈곤율 추이를 나타내며…" 라고 써 놓고
// 실제로는 "2011: 57.0% / 2023: 55.5%" 두 줄만 남았다. 신문 단계에만 "표를 직접 써라"는 지시가 있어서 다른 단계는 설명으로 대체된다.
// 특정 과제에 묶지 않는다 — 안내문(요구사항·항목·설명)이 표·그래프를 말할 때만 걸린다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

const DATA_VISUAL = /그래프|도표|차트|통계\s*표|표로|표\s*(?:를|로|에)\s*(?:만들|작성|제시|정리|나타)|막대|꺾은선|원\s*그래프/;
/** "표현·발표·대표"처럼 낱말 속 "표"에 걸리지 않게, 단독 낱말이거나 자료를 뜻할 때만 본다. */
const BARE_TABLE = /(?:^|[\s(·,])표(?:[\s)]|$|를|로|에|와|과|의)/;

export interface VisualElement {
  label: string;
  description: string;
  required_items?: string[];
}

/** 단계 이름이 긴 실제 안내문("경제 문제 분석 및 소견 평가지")은 요구사항에 통째로 나오지 않는다 — 이름의 낱말이 겹치면 그 단계를 말한 것으로 본다. */
const GENERIC_LABEL_WORD = /^(?:작성|제출|활동|내용|자료|단계|과제|결과|글|및|또는)$/;
function labelMentioned(label: string, line: string): boolean {
  const text = line.replace(/\s/g, "");
  const whole = label.replace(/\s/g, "");
  if (whole.length >= 2 && text.includes(whole)) return true;
  return label
    .split(/[\s·/,()]+/)
    .filter((w) => w.length >= 2 && !GENERIC_LABEL_WORD.test(w))
    .some((w) => text.includes(w));
}

/**
 * 이 단계가 글 안에 표·그래프를 직접 만들어야 하는가.
 * soleStep(이번에 만드는 단계가 하나뿐)이면 안내문의 조건이 모두 그 단계의 것이다.
 */
export function needsDataTable(el: VisualElement, requirements: string[] = [], guide?: string, soleStep = false): boolean {
  const own = `${el.label} ${el.description} ${(el.required_items ?? []).join(" ")}`;
  if (DATA_VISUAL.test(own) || BARE_TABLE.test(own)) return true;
  return [...requirements, guide ?? ""].some((line) => {
    if (!line) return false;
    if (!soleStep && !labelMentioned(el.label, line)) return false;
    return DATA_VISUAL.test(line) || BARE_TABLE.test(line);
  });
}

/** 생성 프롬프트에 넣을 지시. 해당 단계가 없으면 빈 문자열. */
export function dataTableInstruction(labels: string[]): string {
  if (labels.length === 0) return "";
  return (
    `\n【표·그래프 — 반드시 지킬 것】 ${labels.map((l) => `"${l}"`).join(", ")} 단계는 수치를 마크다운 표로 직접 써 넣을 것:\n` +
    `| 연도 | 값 |\n| --- | --- |\n| 2011 | 57.0% |\n처럼 머리줄과 구분줄을 갖춘 표로 쓰고, 값은 조사로 확인된 수치만 넣는다.\n` +
    `"아래 그래프는 ~를 나타낸다", "그래프 삽입"처럼 설명이나 자리 표시로 대신하지 말 것. 그림으로 그려야 하는 그래프는 이 표를 보고 학생이 직접 그린다.\n`
  );
}

/** 글에 실제 표가 있는가 — 머리줄·구분줄·숫자가 든 줄을 갖춘 마크다운 표. */
export function hasDataTable(content: string): boolean {
  const lines = content.split("\n").map((l) => l.trim());
  for (let i = 0; i + 2 < lines.length + 1; i++) {
    if (!/^\|.*\|$/.test(lines[i] ?? "")) continue;
    if (!/^\|[\s:|-]+\|$/.test(lines[i + 1] ?? "")) continue;
    const body = lines.slice(i + 2).findIndex((l) => !/^\|.*\|$/.test(l));
    const rows = (body < 0 ? lines.length - (i + 2) : body);
    if (rows >= 1 && lines.slice(i + 2, i + 2 + rows).some((l) => /\d/.test(l))) return true;
  }
  return false;
}

export function dataTableRepairText(label: string): string {
  return (
    `"${label}" 단계가 안내문이 요구한 표·그래프를 글 안에 만들지 않고 설명으로 대신했다. ` +
    `이미 쓴 수치(연도·값·각주 번호)를 그대로 써서 마크다운 표(머리줄 + "| --- |" 구분줄 + 값 줄)로 바꿔 넣을 것. ` +
    `새 수치를 만들지 말고, 표에 넣을 값이 글에 없으면 글에 있는 값만으로 표를 만들 것.`
  );
}
