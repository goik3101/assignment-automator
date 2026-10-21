// 분석이 required_items(써야 할 내용 항목)에 채점 조건을 섞어 넣는 문제를 코드로 바로잡는 순수 함수.
// 실측(2026-10-22, 영어 발명품 제안서): "영어 120단어 이상", "수동태 사용(해당 어법에 밑줄 표시)", "발명품 사진 제시 여부"가 내용 항목으로 들어가
// 글에 "Photo provided: Yes (…600×400 px)", "Passive constructions used (examples…)" 같은 지어낸 문장·메타 목록이 생겼다.
// 조건은 requirements로 옮기고(지키되 글로 설명하지 않음), 학생이 직접 준비할 사진·그림 제시 항목은 제작 안내로 돌린다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

const LENGTH_CONDITION = /\d+\s*(?:단어|words?|자|글자|문장|줄)\s*(?:이상|이내|이하|내외|안팎)?|분량/i;
const GRAMMAR_CONDITION = /수동태|능동태|관계(?:대명사|부사)|강조\s*(?:용법|구문)|It\s*~?\s*that|가정법|분사구문|to부정사|동명사|어법|문법|시제\s*일치|밑줄/i;
const FORMAT_CONDITION = /표시\s*여부|제시\s*여부|기재\s*여부|포함\s*여부|맞춤법|글씨|서명|작성\s*여부/;
const VISUAL_PROVIDE = /(?:사진|그림|이미지|삽화)[^,]{0,12}(?:제시|부착|첨부|준비|붙이)/;

// "제목", "내용", "본문"처럼 칸 이름만 있는 항목은 써야 할 내용을 알려 주지 않는다 — 소제목으로 강제하면 "제목, 내용 비어 있어요" 거짓 경고가 난다(실측: 현대사 신문 머리기사).
const GENERIC_FIELD = /^\s*(?:제목|내용|본문|글|작성란|기사\s*(?:제목|내용))\s*$/;

export type ItemKind = "content" | "condition" | "visual_provide" | "generic_field";

export function classifyAnalysisItem(item: string): ItemKind {
  if (GENERIC_FIELD.test(item)) return "generic_field";
  if (VISUAL_PROVIDE.test(item)) return "visual_provide";
  if (LENGTH_CONDITION.test(item) || GRAMMAR_CONDITION.test(item) || FORMAT_CONDITION.test(item)) return "condition";
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
