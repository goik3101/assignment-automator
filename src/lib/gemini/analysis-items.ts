// 분석이 required_items(써야 할 내용 항목)에 채점 조건을 섞어 넣는 문제를 코드로 바로잡는 순수 함수.
// 실측(2026-10-22, 영어 발명품 제안서): "영어 120단어 이상", "수동태 사용(해당 어법에 밑줄 표시)", "발명품 사진 제시 여부"가 내용 항목으로 들어가
// 글에 "Photo provided: Yes (…600×400 px)", "Passive constructions used (examples…)" 같은 지어낸 문장·메타 목록이 생겼다.
// 조건은 requirements로 옮기고(지키되 글로 설명하지 않음), 학생이 직접 준비할 사진·그림 제시 항목은 제작 안내로 돌린다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

const LENGTH_CONDITION = /\d+\s*(?:단어|words?|자|글자|문장|줄)\s*(?:이상|이내|이하|내외|안팎)?|분량/i;
const GRAMMAR_CONDITION = /수동태|능동태|관계(?:대명사|부사)|강조\s*(?:용법|구문)|It\s*~?\s*that|가정법|분사구문|to부정사|동명사|어법|문법|시제\s*일치|밑줄/i;
const FORMAT_CONDITION = /표시\s*여부|제시\s*여부|기재\s*여부|포함\s*여부|맞춤법|글씨|서명|작성\s*여부/;
// 채점 기준 문장이 항목으로 섞여 들어온다("역사적 사실과 어긋나는 사실이 없는 내용", "논리적인 주장").
// 칸 이름이 아니라 "어떻게 써야 잘 쓴 것인가"이므로 소제목이 되면 안 된다. 평가를 말하는 꾸밈말이 붙어 있을 때만 거른다
// ("전달하고자 하는 메시지", "국내 또는 해외에 미치는 영향" 같은 진짜 칸은 꾸밈말이 없다).
const GRADING_PHRASE =
  /(?:어긋나|벗어나|빠짐없|적절한|정확한|논리적(?:인|으로)|구체적(?:인|으로)|타당한|충실한|분명한|사실과\s*일치|없는|갖춘)[^,]{0,10}(?:내용|주장|근거|서술|설명|표현|구성)\s*$/;

const VISUAL_PROVIDE = /(?:사진|그림|이미지|삽화)[^,]{0,12}(?:제시|부착|첨부|준비|붙이)/;

// "제목", "내용", "본문"은 **양식지(시험지)의 진짜 칸**이다 — 학생은 거기에 나눠 적어야 한다.
// 2026-10-22에는 이것을 버렸다("써야 할 내용을 알려 주지 않는다"). 그 이유는 소제목으로 강제하면
// "제목, 내용 비어 있어요" 거짓 경고가 났기 때문인데, 문제는 **경고 쪽**이었지 칸이 틀린 게 아니었다.
// 2026-11-01에 되돌린다: 항목으로 남기고, 누락 검사에서만 느슨하게 본다(detectMissingRequiredItems의 예외).
// 버린 동안 머리기사·사설이 "제목/내용" 칸 없이 생성돼 양식 점수를 받지 못했다(사용자 결과물.10).
const GENERIC_FIELD = /^\s*(?:제목|내용|본문|글|작성란|기사\s*(?:제목|내용))\s*$/;

/** 양식 칸 이름(제목·내용…)인가 — 항목으로는 세되 "### 소제목이 없다"는 경고는 내지 않는다. */
export function isFormFieldItem(item: string): boolean {
  return GENERIC_FIELD.test(item ?? "");
}

export type ItemKind = "content" | "condition" | "visual_provide" | "generic_field";

export function classifyAnalysisItem(item: string): ItemKind {
  if (VISUAL_PROVIDE.test(item)) return "visual_provide";
  if (LENGTH_CONDITION.test(item) || GRAMMAR_CONDITION.test(item) || FORMAT_CONDITION.test(item)) return "condition";
  if (GRADING_PHRASE.test(item)) return "condition";
  return "content";
}

/** 내용 항목과 조건을 나눈다. 내용 항목이 2개 미만이 되면 항목 구조를 쓰지 않는다(호출부가 undefined로 처리). */
export function splitAnalysisItems(items: string[] | undefined): { content: string[]; conditions: string[]; visuals: string[] } {
  const out = { content: [] as string[], conditions: [] as string[], visuals: [] as string[] };
  for (const item of items ?? []) {
    const kind = classifyAnalysisItem(item);
    if (kind === "content") out.content.push(item);
    else if (kind === "condition") out.conditions.push(item);
    else if (kind === "visual_provide") out.visuals.push(item);
  }
  return out;
}
