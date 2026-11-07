// 양식지 칸의 **줄 수**를 글자 수 목표로 바꾼다. alias import 없음(node:test에서 바로 불러옴).
//
// 왜(실측 2026-11-07): 안내문이 칸 크기를 또박또박 알려 주는데 우리가 무시하고 있었다.
//   writing_guide: "머리기사: 양식 칸은 '제목' 약 1줄, '내용' 약 5줄. … 사설/칼럼: '제목' 약 1줄, '내용' 약 5줄."
//   실제 결과물: 머리기사 1102자·949자, 사설 308자·2286자 (5줄 칸은 150자 남짓이다)
// 칸의 2~15배를 쓰고 실행마다 7배씩 차이가 났다. 학생은 받은 글을 그대로 칸에 옮길 수가 없다.
// CLAUDE.md에 "줄 수는 셀 수 없어 프롬프트로만 전한다"고 적혀 있었는데, 그 '프롬프트로만'이 문장 그대로
// "약 5줄"을 넘기는 것이어서 모델이 글자 수로 환산하지 못했다. 숫자로 바꿔 주면 따른다.
//
// 환산값은 **추정**이다(손글씨 칸 한 줄 ≈ 공백 포함 30자). 그래서 경고·미달 판정에는 쓰지 않고
// 생성 가이드로만 쓴다 — 안내문에 없는 기준으로 학생에게 "못 지켰다"고 하면 안 된다(2026-11-03 190단어 사건).

/** 양식지 손글씨 한 줄에 들어가는 글자 수(공백 포함) 추정. */
export const CHARS_PER_LINE = 30;

export interface BoxLength {
  label: string;
  lines: number;
  min: number;
  max: number;
}

const LINE_NUM = /(\d{1,2})\s*줄/g;
/** "질문1·답변1·질문2·답변2는 각각 약 2줄" — 각각 앞의 나열 개수만큼 곱한다. */
const EACH = /각각/;

/** 한 칸 설명에서 줄 수를 더한다. "각각 N줄"은 바로 앞 나열의 항목 수만큼 곱한다. */
export function linesInChunk(chunk: string): number {
  let total = 0;
  for (const m of chunk.matchAll(LINE_NUM)) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0 || n > 60) continue;
    const before = chunk.slice(0, m.index ?? 0);
    if (EACH.test(before.slice(-30))) {
      // "각각" 앞의 가장 가까운 나열(A·B·C 또는 A, B, C)의 항목 수
      const list = before.replace(/\s*각각.*$/, "").trim();
      // 쉼표까지 끊어야 한다 — 안 그러면 앞 칸("'인터뷰 대상' 약 1줄,")까지 나열로 세어 개수가 부푼다.
      const tail = list.split(/[.。:：,，]/).pop() ?? "";
      const count = tail.split(/[·,]/).filter((x) => x.trim()).length;
      total += n * Math.max(1, count);
    } else {
      total += n;
    }
  }
  return total;
}

/** 한 칸에 이보다 많은 줄이 잡히면 읽기가 틀린 것으로 본다(양식 칸 하나가 12줄을 넘는 일은 드물다). */
const MAX_PLAUSIBLE_LINES = 12;

/**
 * 단계 이름을 작성 기준 글에서 찾는다. 이름을 **정확히** 맞추려 하면 안 된다 — 분석이 만든 단계 이름은
 * 실행마다 흔들리고(CLAUDE.md: 같은 사진 11회에 이름이 11가지), 안내문은 "사설/칼럼"을 그냥 "사설"로 적는다.
 * 그래서 전체 이름 → 구분 기호로 쪼갠 조각 순서로 느슨하게 본다.
 */
function findLabel(guide: string, label: string): number {
  const parts = [label, ...label.split(/[/·,|]/)].map((p) => p.trim()).filter((p) => p.length >= 2);
  for (const p of parts) {
    const withColon = guide.indexOf(`${p}:`);
    if (withColon >= 0) return withColon;
  }
  for (const p of parts) {
    const at = guide.indexOf(p);
    if (at >= 0) return at;
  }
  return -1;
}

/** 글을 쓰는 칸이 아니라 **그림을 그리는 칸**(만평·삽화·컷)인 단계 이름. 글자 수 목표를 주면 안 된다. */
const DRAWING_BOX = /만평|만화|삽화|그림\s*칸|컷\s*그림|캐리커처|포스터\s*그림/;

/** 글이 아니라 그림이 들어가는 칸인지. 분량 가이드를 주면 안 되는 단계다(그림 칸 규칙과 정면으로 부딪힌다). */
export function isDrawingBox(label: string): boolean {
  return DRAWING_BOX.test((label ?? "").replace(/\s/g, ""));
}

/**
 * writing_guide를 단계 이름으로 나눠 칸별 줄 수를 읽는다.
 * 단계 이름이 "레이블:" 꼴로 나오는 안내문에서만 걸린다 — 못 찾으면 그 단계는 빠진다(추측하지 않는다).
 *
 * 실측으로 막은 두 가지(2026-11-08, 신문 1회):
 *  ① **그림 칸에 글자 수 목표가 붙었다** — "만평/광고 16줄→360~624자"가 나가서, 그림 칸의 각주를 떼는 규칙과
 *     정반대로 **483자짜리 산문을 써도 된다고 허락**해 버렸다. 그림 칸은 아예 제외한다.
 *  ② **이름을 못 찾은 칸의 줄 수가 앞 칸으로 쏠렸다** — 레이블 세 개가 안 걸린 실행에서 마지막 레이블의 구간이
 *     뒤에 남은 "N줄"을 전부 합쳐 16줄이 됐다. 구간을 레이블이 들어 있는 **문장까지**로 끊고, 줄 수가
 *     터무니없이 크면 버린다. 분석이 만든 단계 이름은 실행마다 흔들리므로(CLAUDE.md) 이 방어가 필요하다.
 */
export function boxLengths(labels: string[], guide: string | undefined): BoxLength[] {
  if (!guide?.trim() || labels.length === 0) return [];
  // 각 레이블이 나오는 위치를 찾아 그 다음 레이블 전까지를 그 칸의 설명으로 본다.
  const marks = labels
    .filter((label) => !isDrawingBox(label))
    .map((label) => ({ label, at: findLabel(guide, label) }))
    .filter((m) => m.at >= 0)
    .sort((a, b) => a.at - b.at);
  if (marks.length === 0) return [];
  const out: BoxLength[] = [];
  for (let i = 0; i < marks.length; i++) {
    const until = i + 1 < marks.length ? marks[i + 1].at : guide.length;
    // 레이블이 들어 있는 문장까지만 본다 — 뒤 칸의 줄 수를 끌어오지 않게.
    const rest = guide.slice(marks[i].at, until);
    const stop = rest.search(/[.。](?:\s|$)/);
    const chunk = stop >= 0 ? rest.slice(0, stop + 1) : rest;
    const lines = linesInChunk(chunk);
    if (lines <= 0 || lines > MAX_PLAUSIBLE_LINES) continue;
    const target = lines * CHARS_PER_LINE;
    out.push({ label: marks[i].label, lines, min: Math.round(target * 0.75), max: Math.round(target * 1.3) });
  }
  return out;
}

/** 생성 프롬프트에 넣을 블록. 칸 크기를 읽은 단계가 없으면 빈 문자열. */
export function boxLengthBlock(boxes: BoxLength[]): string {
  if (boxes.length === 0) return "";
  const lines = boxes.map(
    (b) => `- "${b.label}": 양식 칸이 약 ${b.lines}줄 → 공백 포함 **${b.min}~${b.max}자**로 쓸 것(제목 줄은 빼고 센다).`
  );
  return (
    `\n【양식 칸 크기 — 반드시 지킬 것】 학생은 이 글을 **안내문 양식의 칸에 그대로 옮겨 적는다**. 칸을 넘치면 쓸 수가 없다.\n` +
    `${lines.join("\n")}\n` +
    `칸에 맞추려고 필수 항목을 빼지는 말 것 — 항목은 모두 다루되 한 항목을 한두 문장으로 압축한다.\n`
  );
}

/** 칸 크기를 크게 벗어난 단계. 넘침만 본다 — 짧은 것은 필수 항목 충족으로 판단한다(글자 수로 "미달"이라 하지 않는다). */
export interface BoxOverflow {
  label: string;
  actual: number;
  max: number;
  lines: number;
}

/** 이 배율을 넘으면 학생이 칸에 옮겨 적을 수 없다고 본다. 조금 넘는 것(1.0~1.7배)은 손글씨 크기 차이로 들어간다. */
export const OVERFLOW_RATIO = 1.7;

/**
 * 칸 크기를 읽은 단계 중 크게 넘친 것을 찾는다.
 *
 * 왜 사후 검사가 필요한가(실측 2026-11-07, 같은 안내문·같은 설정 3회): 칸 크기를 글자 수로 전하면
 * 2회는 범위에 들어왔는데(머리기사 272자·313자, 목표 135~234) 1회는 881자로 3.8배가 나왔다.
 * 즉 전달은 되지만 **실행마다 지켜지지 않는다**. 프롬프트로 더 세게 말하는 대신 코드로 세어 그 단계만 고친다.
 */
export function boxOverflows(
  sections: { label: string; content: string }[],
  boxes: BoxLength[]
): BoxOverflow[] {
  const out: BoxOverflow[] = [];
  for (const box of boxes) {
    const sec = sections.find((s) => s.label === box.label);
    if (!sec) continue;
    const actual = sec.content.trim().length;
    if (actual > box.max * OVERFLOW_RATIO) out.push({ label: box.label, actual, max: box.max, lines: box.lines });
  }
  return out;
}

/** 넘친 단계 하나를 줄이라는 지시. 항목을 빼지 말고 문장을 줄이게 한다. */
export function boxOverflowRepairText(o: BoxOverflow): string {
  return (
    `[양식 칸 넘침 — "${o.label}" 단계] 안내문의 이 칸은 약 ${o.lines}줄이라 공백 포함 ${o.max}자 안에 들어와야 하는데 ` +
    `지금 ${o.actual}자다. 학생이 칸에 옮겨 적을 수 없다. 다루는 항목·사실·각주는 그대로 두고 문장을 줄여 ` +
    `${Math.round(o.max * 0.8)}~${o.max}자로 다시 써라. 설명을 덧붙이거나 같은 말을 되풀이한 문장을 먼저 지우고, ` +
    `한 항목은 한두 문장으로 압축한다. 새로운 사실·수치·출처를 추가하지 말 것.`
  );
}
