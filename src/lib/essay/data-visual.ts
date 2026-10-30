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

// ── 쓸 수 있는 자료 종류 제한 ────────────────────────────────────
// 실측(2026-10-29~30, 저장된 생성 26회 중 9회): 안내문이 "시각 자료는 그림·그래프·표만"이라고 못 박았는데도
// 스토리보드 화면 설명에 "헌법재판소 건물 사진", "발표자가 손을 든 사진"이 들어갔다. 제한은 프롬프트로 이미 전달되는데도 어긴다.
const VISUAL_NOUNS = ["그림", "그래프", "표", "사진", "영상", "동영상", "삽화", "도표", "차트", "이미지", "인포그래픽", "만화"];
/** "A·B만 (사용할 수) 있다 / 가능하다"처럼 종류를 한정한 문장, 또는 "사진은 사용할 수 없다"처럼 금지한 문장. */
const ONLY_SENTENCE = /만\s*(?:사용|활용|가능|허용|쓸)/;
const BAN_SENTENCE = /(?:사용|활용)(?:할\s*수)?\s*(?:없|불가|금지|안\s*됨|안\s*된다)|금지|쓰지\s*(?:말|않)/;

export interface VisualPolicy {
  /** 쓸 수 있는 자료 종류(비어 있으면 제한 없음) */
  allowed: string[];
  /** 쓰면 안 되는 자료 종류 */
  banned: string[];
}

export function visualPolicy(texts: string[]): VisualPolicy {
  const allowed = new Set<string>();
  const banned = new Set<string>();
  for (const raw of texts) {
    for (const s of (raw ?? "").split(/(?<=[.。!?])\s+|\n+/)) {
      const nouns = VISUAL_NOUNS.filter((n) => s.includes(n));
      if (nouns.length === 0) continue;
      if (ONLY_SENTENCE.test(s)) {
        for (const n of nouns) allowed.add(n);
      } else if (BAN_SENTENCE.test(s)) {
        for (const n of nouns) banned.add(n);
      }
    }
  }
  // "그림·그래프·표만"이면 나머지는 자동으로 금지다.
  if (allowed.size > 0) for (const n of VISUAL_NOUNS) if (!allowed.has(n)) banned.add(n);
  for (const n of allowed) banned.delete(n);
  return { allowed: [...allowed], banned: [...banned] };
}

/** 프롬프트에 넣을 한 줄. 제한이 없으면 빈 문자열. */
export function visualPolicyInstruction(policy: VisualPolicy, labels: string[]): string {
  if (policy.allowed.length === 0 && policy.banned.length === 0) return "";
  const who = labels.length ? `${labels.map((l) => `"${l}"`).join(", ")} 단계의 ` : "";
  return (
    `\n【쓸 수 있는 자료 종류 — 반드시 지킬 것】 ${who}화면·지면에 넣을 수 있는 자료는 ` +
    `${policy.allowed.length ? policy.allowed.join("·") + "뿐이다" : "안내문이 허용한 것뿐이다"}. ` +
    `${policy.banned.length ? policy.banned.join("·") + "은(는) 쓸 수 없다 — " : ""}` +
    `"건물 사진", "발표자 사진", "영상 클립"처럼 금지된 자료를 화면 설명·시각 자료 항목에 적지 말 것. ` +
    `같은 내용을 허용된 자료(${policy.allowed.join("·") || "그림·그래프·표"})로 바꿔 쓸 것.\n`
  );
}

/** 글에서 금지된 자료를 언급한 줄. */
export function findBannedVisuals(content: string, policy: VisualPolicy): string[] {
  if (policy.banned.length === 0) return [];
  const re = new RegExp(policy.banned.join("|"));
  return content
    .split("\n")
    .filter((l) => !/^\s*#/.test(l) && re.test(l))
    // "사진을 쓰지 않는다", "사진 대신 도표로"처럼 안 쓴다고 밝힌 줄은 위반이 아니다.
    .filter((l) => !/대신|쓰지\s*(?:말|않)|제외|금지/.test(l))
    .map((l) => l.trim());
}

export function bannedVisualRepairText(label: string, lines: string[], policy: VisualPolicy): string {
  return (
    `"${label}" 단계가 안내문이 허용하지 않은 자료를 썼다(${policy.banned.join("·")}): ` +
    `${lines.slice(0, 2).map((l) => `"${l.slice(0, 50)}…"`).join(" / ")}. ` +
    `그 자리를 허용된 자료(${policy.allowed.join("·") || "그림·그래프·표"})로 바꿔 쓸 것 — 예를 들어 "건물 사진" 대신 ` +
    `"연도별 수치를 담은 표"나 "제도 흐름을 그린 그림"처럼. 다른 문장과 사실·각주는 그대로 둘 것.`
  );
}

export function dataTableRepairText(label: string): string {
  return (
    `"${label}" 단계가 안내문이 요구한 표·그래프를 글 안에 만들지 않고 설명으로 대신했다. ` +
    `이미 쓴 수치(연도·값·각주 번호)를 그대로 써서 마크다운 표(머리줄 + "| --- |" 구분줄 + 값 줄)로 바꿔 넣을 것. ` +
    `새 수치를 만들지 말고, 표에 넣을 값이 글에 없으면 글에 있는 값만으로 표를 만들 것.`
  );
}
