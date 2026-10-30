// 학생이 실제로 하지 않은 행동을 "했다"고 쓴 문장을 찾는다.
// 실측(2026-10-29, 사용자가 제출 직전까지 간 실제 결과물): 자료 수집 단계가 "오늘 수업 시간 중 스마트폰으로 … 화면을 촬영했다",
// "OECD 비교 통계를 캡처해 보관했다", "수행평가지에 각 사진 아래에 … 적었다"처럼 학생이 하지도 않은 활동을 1인칭 과거형으로 지어냈다.
// 그대로 제출하면 거짓 기록이 되므로 글 품질이 아니라 신뢰 문제다. 프롬프트에 금지 규칙이 있어도 나왔으므로 코드로도 센다.
// 오탐이 더 해로우니 "학생만 할 수 있는 물리적 행동"의 과거형만 본다 — "확인했다·기록했다·분석했다"처럼 글에서도 자연스러운 말은 넣지 않는다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

/** 학생이 몸으로 해야 하는 일. 이 말이 있고 문장이 과거형으로 끝나면 "했다고 지어낸 것"으로 본다. */
const OWN_ACTION = /촬영|캡처|캡쳐|스크랩|출력|인쇄|부착|첨부|오려|사진을?\s*찍|붙여|붙이|방문|인터뷰|설문/;
/** 과거·완료 어미. 현재형("촬영한다", "붙인다")은 계획·설명이라 건드리지 않는다. */
const PAST = /(?:했|였|었|았|뒀)(?:다|고|으며|음)|두었다|찍었다|붙였다/;
/** 주어가 학생이 아닌 문장(기관·매체·연구가 한 일)은 사실 서술이다. */
const THIRD_PARTY =
  /(?:정부|부처|청|위원회|기관|연구(?:진|팀|소)?|학회|대학|신문|언론|방송|기자|기사|보도|보고서|자료|기업|회사|협회|재단|단체|경찰|법원|헌법재판소|통계청|보건복지부|교육청)(?:는|은|이|가|에서|에서는|에 따르면)/;

/**
 * 절 단위로 본다 — "보건복지부가 발표를 확인했고, 해당 화면을 촬영했다"처럼 앞 절의 주어가 기관이어도
 * 촬영한 것은 학생이다. 행동이 들어 있는 절에 기관 주어가 없으면 학생이 한 일로 본다.
 */
export function isOwnActivitySentence(sentence: string): boolean {
  const s = sentence.replace(/\[\d+\]/g, "").trim();
  if (!s) return false;
  const clauses = s.split(/,\s*|(?<=[가-힣])고\s+/);
  return clauses.some((c) => OWN_ACTION.test(c) && PAST.test(c) && !THIRD_PARTY.test(c));
}

/** 글에서 학생 행동을 지어낸 문장을 모은다(소제목·표 줄은 제외). */
export function findOwnActivitySentences(content: string): string[] {
  const out: string[] = [];
  for (const line of content.split("\n")) {
    if (/^\s*(?:#|\|)/.test(line)) continue;
    for (const sentence of line.split(/(?<=[.!?。])\s+/)) {
      const s = sentence.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
      if (s.length >= 8 && isOwnActivitySentence(s)) out.push(s);
    }
  }
  return out;
}

/** 학생이 직접 수행한 것을 적는 단계인가(자료 수집·조사 기록·관찰 활동지). 이런 단계만 빈칸 규칙을 적용한다. */
const OWN_RECORD_LABEL =
  /자료\s*수집|수집\s*(?:및|과|·)?\s*기록|조사\s*(?:및|과|·)?\s*기록|관찰\s*기록|기록지|활동지|활동\s*기록|탐구\s*일지|취재/;
const OWN_RECORD_DESC = /(?:직접|스스로)\s*(?:조사|수집|관찰|촬영|기록)|수행평가지에\s*(?:붙|적|기록)/;
export function isOwnRecordStep(el: { label: string; description?: string }): boolean {
  return OWN_RECORD_LABEL.test(el.label) || OWN_RECORD_DESC.test(el.description ?? "");
}

const BLANK = /\[직접\s*작성[^\]]*\]/g;
export function countBlanks(content: string): number {
  return (content.match(BLANK) ?? []).length;
}

/** 빈칸이 너무 많을 때 줄 보완 지시 — 본인만 아는 것만 남기고 나머지는 채우게 한다. */
export function blankOveruseRepairText(max: number, found: number): string {
  return (
    `"[직접 작성: …]" 빈칸이 ${found}개나 된다(최대 ${max}개). 빈칸은 학생 본인만 알 수 있는 것(이름, 사는 지역·학교, 조사한 날짜, ` +
    `본인이 직접 센 값, 설문에 응한 사람 수)에만 남기고, 나머지 빈칸은 실제 내용으로 채울 것 — 어떤 자료를 어디서 찾는지(기관·자료 이름), ` +
    `조사 방법과 순서, 설문·인터뷰 문항 초안, 자료가 보여 주는 사실과 수치는 빈칸이 아니라 글로 쓴다. 다른 문장과 각주는 그대로 둘 것.`
  );
}

/** 걸린 단계에 줄 보완 지시(이미 있는 "그 단계만 고치기" 경로로 전달한다). */
export function ownActivityRepairText(sentences: string[]): string {
  const quoted = sentences.slice(0, 3).map((s) => `"${s.slice(0, 60)}…"`).join(" / ");
  return (
    `학생이 실제로 하지 않은 행동을 한 것처럼 쓴 문장이 있다(${quoted}). ` +
    `사진 촬영·캡처·스크랩·출력·부착·방문·인터뷰는 학생이 직접 하는 일이라 AI가 "했다"고 쓸 수 없다. ` +
    `그 문장들은 자료의 내용(자료 이름·출처 기관·사실·수치)과 할 일의 방법을 쓰는 문장으로 바꾸고("~에서 ~를 확인한다"), ` +
    `빈칸("[직접 작성: 무엇]")은 학생 본인만 알 수 있는 것(이름·사는 지역·조사한 날짜·본인이 직접 센 값)에만 남길 것. ` +
    `다른 문장과 사실(연도·수치·각주 번호)은 그대로 둘 것.`
  );
}
