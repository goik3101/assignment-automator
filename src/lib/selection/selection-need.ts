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
const SELECT_VERB =
  /선정(?!\s*(?:기준|기준액|률|율))|선택(?!\s*(?:과목|지|권|사항|적))|고르|골라|고른|고를|(?<![가-힣])(?:정하|택하)/g;
/** 무엇을 고르는가 — 이 낱말이 서술어 앞에 있어야 "대상 선정"으로 본다. */
const TARGET_WORD =
  /인물|위인|작가|예술가|과학자|발명가|대상|주제|소재|제재|사례|사건|작품|도서|책|기업|회사|국가|나라|지역|도시|정책|제도|쟁점|사회\s*문제|탐구\s*문제|현상|실험|직업|진로|분야|종목|음식|장소|생물|동물|식물|원소|화합물|물질|발명품|유물|문화재|기사|광고|영화|드라마|노래|시|소설|한\s*(?:명|가지|곳|편|개)|하나/;
/** 대상이 아니라 진행 방식을 정하는 말 — 고르라는 말이 있어도 대상 선정이 아니다. */
const NOT_TARGET = /순서|차례|순번|제비뽑기|역할|모둠|조원|짝|일정|날짜|기한|분량|시간|매체|형식|도구|프로그램|플랫폼/;
/** 대상을 고른 것을 전제로 하는 항목("선정 이유", "선정한 인물") — 이것만으로도 선정 과제다. */
const SELECTED_FIELD = /(?:선정|선택)\s*(?:한|된)?\s*(?:이유|까닭|배경|과정|동기|인물|대상|주제|작품|사례)/;

/** 서술어 앞 같은 절에 대상 낱말이 있는가. */
function picksATarget(line: string): boolean {
  const text = line.replace(/\s+/g, " ");
  SELECT_VERB.lastIndex = 0;
  for (let m = SELECT_VERB.exec(text); m; m = SELECT_VERB.exec(text)) {
    // 바로 앞 절(쉼표·접속 이후)만 본다 — 한 문장에 여러 지시가 이어 붙는 일이 많다.
    const before = text.slice(0, m.index);
    const clause = before.slice(Math.max(0, before.lastIndexOf(",") + 1)).slice(-40);
    if (NOT_TARGET.test(clause)) continue;
    if (TARGET_WORD.test(clause)) return true;
  }
  return false;
}

const LEGACY = /선정|선택|고르|고른|골라|정해서|정하여|정한 뒤|정하고/;

/** 학생이 다룰 대상을 스스로 골라야 하는 과제인가. SELECTION_TRIGGER=legacy면 예전 규칙(문자열 포함)으로 돌아간다. */
export function needsSubjectSelection(info: SelectionNeedInfo): boolean {
  const lines = [
    info.topic,
    ...info.requirements,
    ...(info.task_elements ?? []).flatMap((e) => [e.label, e.description, ...(e.required_items ?? [])]),
  ].filter(Boolean);
  if (process.env.SELECTION_TRIGGER === "legacy") return LEGACY.test(lines.join(" "));
  return lines.some((l) => SELECTED_FIELD.test(l) || picksATarget(l));
}
