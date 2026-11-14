// 웹 검색이 "실제로 필요한" 과제인지 판별한다. 검색은 호출당 요금($0.01)이 붙으므로, 사실 조사가 필요 없는 창작·계산·기획형 과제에는
// 검색을 강제하지 않는다(도구는 켜 두어 모델이 필요하면 쓰게 한다). 판별이 애매하면 검색을 강제하는 쪽(기본 true)으로 한다 —
// 출처가 필요한 과제에서 검색을 빼먹는 것이 더 큰 문제이기 때문이다.
// 외부 자료를 조사·인용해야 한다는 뜻이 분명한 표현. "탐구·실험·원리·이론"은 계산·수식 중심 과제(수학 탐구 등)에도 흔히 쓰이고,
// "방법"의 '법'·"책임"의 '책'처럼 낱말 속 글자가 걸리는 일도 있어서 여기에 넣지 않는다(단독 낱말일 때만 본다).
const FACT_HINT = /조사|출처|자료|통계|근거|인물|사건|역사|(?<![가-힣])책(?=[을이은는의과와도에]|처방|\s|$|[,.)])|도서|독서|저자|인용|업적|연구|현황|사례|법률|법령|헌법|(?<![가-힣])법(?=[을이은는의과와도에]|\s|$)|제도|정책|뉴스|기사/;
const CREATIVE_HINT = /신조어|창작|시를|자유시|일기|편지|소설|나의 (?:하루|경험|다짐|꿈)|경험 에세이|수식|계산|앱\s*(?:기획|서비스)|포스터|캐릭터|광고 문구|슬로건/;

// 학생이 **문제를 내고 채점 기준을 만드는** 과제(출제형)는 웹에서 찾아올 사실이 없다 — 재료가 교과 내용이다.
// 왜(2026-11-14 실측, 수학 수리논술 출제): 검색이 켜진 실행이 "수능 미적분 선택 비율 43.7%" 표를 지어내
// 출제 계획과 문항 칸에 각각 붙였고(각주 1개·출처 1개, 인용 페이지에 없는 수치 경고 2건), 그 검색 호출에만
// 25.7초를 썼다(생성 47.5초). 같은 안내문의 다른 실행은 검색 0회로 12/12였다 — 분석 흔들림에 따라 갈린다.
// 꼴로 가린다: "<문항|문제|시험지>를 출제·제작·설계", "출제 계획·의도", "채점 기준(표)을 작성·제작".
// 동사를 바로 뒤에서만 받는다 — "채점 기준표에 따라 작성"(안내문마다 있다)은 걸리면 안 된다.
const AUTHORING_HINT =
  /(?:문항|문제|시험지)(?:\s*및[^.\n]{0,20})?\s*(?:을|를)?\s*(?:직접\s*)?(?:출제|제작|만들|설계|작성)|출제\s*(?:계획|의도)|채점\s*기준(?:표)?(?:을|를)?\s*(?:직접\s*)?(?:작성|제작|만들)/;
// 출제형이어도 **조사해 오라고 적힌** 안내문은 검색한다(한국사 문항 출제, 독서 문항 출제 등).
// FACT_HINT에서 출제·채점 양식에 그냥 쓰이는 낱말(자료=제시 자료, 근거·사례·연구·현황)만 뺀 목록이다.
const RESEARCH_ASKED =
  /조사|출처|통계|인물|사건|역사|(?<![가-힣])책(?=[을이은는의과와도에]|처방|\s|$|[,.)])|도서|독서|저자|인용|업적|법률|법령|헌법|제도|정책|뉴스|기사/;

export interface FactSearchDecision {
  /** 검색을 **강제**할지(tool_choice=required). */
  search: boolean;
  /** 검색 도구를 아예 붙이지 않을지. 붙여 두면 강제하지 않아도 모델이 알아서 쓴다 —
   *  2026-11-14 실측: 수학 출제 과제에서 "검색 강제=끔"인데도 모델이 "AP Calculus 응시자 수"를
   *  검색해 각주 8개를 달았다(출제 과제에 필요 없는 사실이고, 그 검색에 시간과 요금이 든다). */
  tool: boolean;
  /** 그렇게 정한 이유(실행 로그용 — 엉뚱하게 켜져도 결과물만 봐서는 알 수 없다). */
  why: string;
}

export function factSearchReason(...texts: (string | undefined | null)[]): FactSearchDecision {
  const t = texts.filter(Boolean).join(" ");
  const keepTool = process.env.SEARCH_TOOL_OFF === "off";
  if (!t.trim()) return { search: true, tool: true, why: "내용 없음" };
  const fact = t.match(FACT_HINT)?.[0];
  const authoring = t.match(AUTHORING_HINT)?.[0];
  const asked = t.match(RESEARCH_ASKED)?.[0];
  // 출제형은 재료가 교과 내용이라 조사할 사실이 없다 — 도구까지 뗀다(SEARCH_TOOL_OFF=off로 예전처럼).
  if (authoring && !asked) return { search: false, tool: keepTool, why: `출제형("${authoring}")` };
  if (authoring && asked) return { search: true, tool: true, why: `출제형이지만 조사 요구("${asked}")` };
  const creative = t.match(CREATIVE_HINT)?.[0];
  // 창작·계산형은 예전처럼 **강제만** 끈다(도구는 두어 모델이 필요하면 쓰게 한다).
  if (creative && !fact) return { search: false, tool: true, why: `창작·계산형("${creative}") — 강제만 끔` };
  return { search: true, tool: true, why: fact ? `조사 낱말("${fact}")` : "짚을 낱말 없음(기본 켬)" };
}

export function needsFactSearch(...texts: (string | undefined | null)[]): boolean {
  return factSearchReason(...texts).search;
}
