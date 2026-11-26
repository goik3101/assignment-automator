// 한 단계 안에서 **칸마다 얼마나 쓸지**의 기준 — 칸의 종류(이름만 적는 칸 / 설명하는 칸 / 생각을 푸는 칸)로 나눈다. alias import 없음.
//
// 왜(2026-11-26, 안내문 5종을 사진과 대조): 단계 총량만 알려 주고 항목에 나누는 일을 모델에 맡기면 칸 종류와 상관없이 비슷하게 쓴다.
// 수학-02 "경제수학 연계 탐구보고서"(10칸): 단원명(한 줄 칸)에 3문장, 느낀 점·성장한 점·변화한 점은 140자 안팎으로 가장 짧았다 — "어떤 칸은 짧게, 어떤 칸은 길게"가 안 맞는다.
// 같은 프롬프트 8회 재전송(ON/OFF): 성찰 칸 평균 137→189자(+38%), 이름 칸 129→65자, 총량 1,518→1,655자(+9%).
// 근거 순서는 ① 안내문의 숫자 ② 양식 칸의 줄 수(분석이 writing_guide에 적은 것) ③ 이 칸 종류별 기본값이다. 이 파일은 ③만 맡는다.
// 되돌리기: ITEM_SHARE_NOTE=off(성찰·이름 칸 문장만 끈다. 책 제목·저자 칸 문장은 VALUE_FIELD_NOTE).

import { valueFieldNote } from "./bibliographic-fields.ts";

/** 학생의 생각·판단을 풀어 쓰는 칸 이름(느낀 점·성장한 점·결론·후속 탐구 …). */
const REFLECT_ITEM = /느낀\s*점|느낀점|성장한\s*점|변화한\s*점|깨달은\s*점|배운\s*점|소감|성찰|결론|후속\s*탐구|생각\s*(?:넓히기|의\s*변화)|제작\s*후기/;
/** 이름·번호·날짜만 적는 한 줄 칸(서지 칸은 bibliographic-fields가 따로 다룬다). */
const NAME_ONLY_ITEM = /^(?:단원명|과목명?|학번|이름|성명|작성일|일시|날짜)$/;

// 주제를 적는 작은 칸("탐구 주제"·"나의 탐구 주제"·"생명과학 연구주제"). 정확히 "주제"는 bibliographic-fields가 값 칸으로 다룬다.
// 같은 프롬프트 8회 ON/OFF(2026-11-26): 과학-05 연구주제 236→122자, 수학-02 나의 탐구 주제 159→61자, 나머지 칸 거의 그대로(1117→1145, 1986→1969). 칸 사진이 1~3줄 크기였다.
const TOPIC_ITEM = /^(?:나의\s*|우리\s*)?(?:[가-힣]{2,6}\s*)?(?:탐구|연구|발표|보고서)\s*주제$/;
export function topicItems(items: string[] | undefined): string[] {
  return (items ?? []).filter((i) => TOPIC_ITEM.test(i.replace(/\*\*/g, "").trim()));
}

export function reflectionItems(items: string[] | undefined): string[] {
  return (items ?? []).filter((i) => REFLECT_ITEM.test(i.replace(/\*\*/g, "")));
}
export function nameOnlyItems(items: string[] | undefined): string[] {
  return (items ?? []).filter((i) => NAME_ONLY_ITEM.test(i.replace(/\*\*/g, "").trim()));
}

/** 필수 항목 블록 끝에 덧붙일 문장들(서지 칸 문장 + 칸 종류별 문장). 해당 칸이 없으면 빈 글. */
/** boxLimited: 안내문이 단계 전체의 줄·문장 상한을 정했다 — 그 조건이 우선이라 "길게"를 말하지 않는다(사회-03 칸 줄 수). */
export function itemShareNote(items: string[] | undefined, opts: { boxLimited?: boolean } = {}): string {
  const base = valueFieldNote(items);
  if (process.env.ITEM_SHARE_NOTE === "off" || opts.boxLimited) return base;
  const reflect = reflectionItems(items);
  const names = nameOnlyItems(items);
  const topics = topicItems(items);
  if (reflect.length === 0 && names.length === 0 && topics.length === 0) return base;
  const quote = (a: string[]) => a.map((n) => `"${n}"`).join("·");
  const parts: string[] = [];
  if (reflect.length > 0) parts.push(`${quote(reflect)} 칸은 학생의 생각을 풀어 쓰는 칸이라 사실을 설명하는 항목보다 길게(2배 안팎) 쓴다.`);
  if (names.length > 0) parts.push(`${quote(names)} 칸은 이름만 적는 한 줄 칸이다.`);
  if (topics.length > 0) parts.push(`${quote(topics)} 칸은 주제를 한두 문장으로 분명히 쓴다(배경·이유를 길게 풀지 말 것).`);
  return `${base}\n  ${parts.join(" ")}`;
}
