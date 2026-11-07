// 이 과제가 "학생이 다룰 대상을 직접 골라야 하는 과제"인지 판정한다.
// 예전 규칙은 /선정|선택|고르|…|정하고/ 하나로 문자열만 봤다 — 실측(2026-10-31, 국어 매체 활용 주제발표):
// 채점 기준의 "글의 목적·주제·예상 독자를 구체적으로 **설정하고**"가 "정하고"에 걸려 자동 선정이 발동했고,
// 고른 대상(「대한민국 인터넷 실명제(정보통신망법 개정, 2007)」·"유튜브 댓글 섹션"·"프라이버시 인터내셔널 보고서")이
// 조사를 그 하나로 좁혀 근거가 2종으로 줄고 장면 8개가 같은 말이 됐다. "선정기준액", "선택 과목", "역할을 지정하고",
// "진로를 결정하고", "순서를 정하고"도 모두 걸렸다.
// 그래서 (1) 낱말 경계를 지키고 (2) 고르라는 말 앞에 "무엇을" 고르는지(대상 낱말)가 있을 때만 참으로 본다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

export interface SelectionNeedInfo {
  topic: string;
  requirements: string[];
  task_elements: { label: string; description: string; required_items?: string[] }[];
}

/** 고르라는 뜻의 서술어. 앞 글자가 한글이면 "설정·결정·지정·확정·측정"의 일부이므로 보지 않는다. */
const SELECT_VERB_SRC =
  String.raw`선정(?!\s*(?:기준|기준액|률|율))|선택(?!\s*(?:과목|지|권|사항|적))|고르|골라|고른|고를|(?<![가-힣])(?:정하|택하)`;
/**
 * **질문 경로에서만** 더 보는 서술어 — 고르라는 말 없이 고르게 하는 문구.
 * 실측(2026-11-02 한국사 신문): 안내문에 "선정·고르"가 한 번도 없고 "주요 사건을 **소재로 삼고**"만 있어
 * 선정 과제로 안 잡혔다. 그래서 "어떤 사건으로 신문을 만들까요?"를 아무도 묻지 않았고 신문 전체가 엉뚱한 소재로 갔다.
 * 생성 경로의 게이트(needsSubjectSelection)는 **넓히지 않는다** — 그쪽이 켜지면 자동 선정 11~13초가 붙어
 * 30초 기준을 깨고, 틀리면 엉뚱한 대상으로 글을 쓴다. 질문은 틀려도 학생이 건너뛰면 끝이다.
 */
const LOOSE_VERB_SRC = String.raw`삼아|삼고|삼는|삼을|삼은|삼았|잡아|잡고`;

function selectVerbs(loose: boolean): RegExp {
  return new RegExp(loose ? `${SELECT_VERB_SRC}|${LOOSE_VERB_SRC}` : SELECT_VERB_SRC, "g");
}

/**
 * 무엇을 고르는가 — 이 낱말이 서술어 앞에 있어야 "대상 선정"으로 본다.
 * 한 글자 낱말(시·책)은 낱말 경계를 지킨다 — 경계가 없으면 "**시**장 경제 문제를 선정하고"가 '시(詩)'로 읽혔다
 * (2026-11-08 실측: 사회 평가지의 대상 낱말이 "시"로 나와 "어떤 시를 다룰까요?"가 됐다).
 */
const TARGET_WORD =
  /인물|위인|작가|예술가|과학자|발명가|대상|주제|소재|제재|사례|사건|작품|도서|기업|회사|국가|나라|지역|도시|정책|제도|쟁점|사회\s*문제|탐구\s*문제|현상|실험|직업|진로|분야|종목|음식|장소|생물|동물|식물|원소|화합물|물질|발명품|유물|문화재|기사|광고|영화|드라마|노래|소설|(?<![가-힣])(?:시|책)(?![가-힣])|한\s*(?:명|가지|곳|편|개)|하나/;
/** 대상이 아니라 진행 방식을 정하는 말 — 고르라는 말이 있어도 대상 선정이 아니다. */
const NOT_TARGET = /순서|차례|순번|제비뽑기|역할|모둠|조원|짝|일정|날짜|기한|분량|시간|매체|형식|도구|기구|장비|용품|재료|프로그램|플랫폼/;
/** 대상을 고른 것을 전제로 하는 항목("선정 이유", "선정한 인물") — 이것만으로도 선정 과제다. */
const SELECTED_FIELD = /(?:선정|선택)\s*(?:한|된)?\s*(?:이유|까닭|배경|과정|동기|인물|대상|주제|작품|사례)/;

/** 서술어 앞 같은 절에서 고르라고 한 대상 낱말(없으면 null). */
function targetWordIn(line: string, loose = false): string | null {
  const text = line.replace(/\s+/g, " ");
  const verbs = selectVerbs(loose);
  for (let m = verbs.exec(text); m; m = verbs.exec(text)) {
    // 바로 앞 절(쉼표·접속 이후)만 본다 — 한 문장에 여러 지시가 이어 붙는 일이 많다.
    const before = text.slice(0, m.index);
    const clause = before.slice(Math.max(0, before.lastIndexOf(",") + 1)).slice(-40);
    // 진행 방식 낱말은 **고르라는 말 바로 앞**(목적어 자리)에 있을 때만 막는다.
    // 안 그러면 "모둠별로 탐구 주제를 선택한다"가 '모둠' 때문에 통째로 빠진다(실측 2026-11-01 규칙 전수).
    if (NOT_TARGET.test(clause.slice(-8))) continue;
    const hit = clause.match(TARGET_WORD);
    if (hit) return hit[0].replace(/\s+/g, " ");
  }
  return null;
}

/** 서술어 앞 같은 절에 대상 낱말이 있는가. */
function picksATarget(line: string, loose = false): boolean {
  return targetWordIn(line, loose) !== null;
}

function noticeLines(info: SelectionNeedInfo): string[] {
  return [
    info.topic,
    ...info.requirements,
    ...(info.task_elements ?? []).flatMap((e) => [e.label, e.description, ...(e.required_items ?? [])]),
  ].filter(Boolean);
}

/** "한 명"·"하나"처럼 그 자체로는 무엇인지 알 수 없는 말 — 질문 문구에 쓰면 "어떤 하나를 다룰까요?"가 된다. */
const VAGUE_TARGET = /^(?:한 (?:명|가지|곳|편|개)|하나)$/;

/**
 * 안내문이 학생에게 고르라고 한 **대상의 이름**("인물"·"사건"·"사회 문제"…). 못 찾으면 null.
 * 제작 전 질문에서 "어떤 ___을 다룰까요?"의 빈칸으로 쓴다 — 선정 여부(참/거짓)만으로는 질문 문구를 만들 수 없다.
 */
export function selectionTargetWord(info: SelectionNeedInfo, loose = false): string | null {
  const lines = noticeLines(info);
  for (const l of lines) {
    const w = targetWordIn(l, loose);
    if (w && !VAGUE_TARGET.test(w)) return w;
  }
  // "선정 이유"·"선정한 인물"처럼 고른 것을 전제한 항목에서도 대상 이름을 얻는다.
  for (const l of lines) {
    const m = l.replace(/\s+/g, " ").match(/(?:선정|선택)\s*(?:한|된)?\s*(인물|대상|주제|작품|사례)/);
    if (m) return m[1];
  }
  return null;
}

const LEGACY = /선정|선택|고르|고른|골라|정해서|정하여|정한 뒤|정하고/;

/** 학생이 다룰 대상을 스스로 골라야 하는 과제인가. SELECTION_TRIGGER=legacy면 예전 규칙(문자열 포함)으로 돌아간다. */
export function needsSubjectSelection(info: SelectionNeedInfo): boolean {
  const lines = noticeLines(info);
  if (process.env.SELECTION_TRIGGER === "legacy") return LEGACY.test(lines.join(" "));
  return lines.some((l) => SELECTED_FIELD.test(l) || picksATarget(l));
}

/**
 * 제작 전 질문에서만 쓰는 넓은 판정 — "소재로 삼고"처럼 고르라는 말 없이 고르게 하는 안내문까지 본다.
 * 생성 경로(자동 선정)는 여기를 쓰지 않는다. 이유는 LOOSE_VERB_SRC 주석.
 */
export function shouldAskSubject(info: SelectionNeedInfo): boolean {
  const lines = noticeLines(info);
  if (process.env.SELECTION_TRIGGER === "legacy") return LEGACY.test(lines.join(" "));
  return lines.some((l) => SELECTED_FIELD.test(l) || picksATarget(l, true));
}
