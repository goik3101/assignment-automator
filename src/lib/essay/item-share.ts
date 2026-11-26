// 한 단계 안에서 **칸마다 얼마나 쓸지**의 기준 — 칸의 종류(이름만 적는 칸 / 설명하는 칸 / 생각을 푸는 칸)로 나눈다. alias import 없음.
//
// 왜(2026-11-26, 안내문 5종을 사진과 대조): 단계 총량만 알려 주고 항목에 나누는 일을 모델에 맡기면 칸 종류와 상관없이 비슷하게 쓴다.
// 수학-02 "경제수학 연계 탐구보고서"(10칸): 단원명(한 줄 칸)에 3문장, 느낀 점·성장한 점·변화한 점은 140자 안팎으로 가장 짧았다 — "어떤 칸은 짧게, 어떤 칸은 길게"가 안 맞는다.
// 같은 프롬프트 8회 재전송(ON/OFF): 성찰 칸 평균 137→189자(+38%), 이름 칸 129→65자, 총량 1,518→1,655자(+9%).
// 근거 순서는 ① 안내문의 숫자 ② 양식 칸의 줄 수(분석이 writing_guide에 적은 것) ③ 이 칸 종류별 기본값이다. 이 파일은 ③만 맡는다.
// 되돌리기: ITEM_SHARE_NOTE=off(성찰·이름 칸 문장만 끈다. 책 제목·저자 칸 문장은 VALUE_FIELD_NOTE).

import { valueFieldNote } from "./bibliographic-fields.ts";
import { itemBoxNote, itemBoxPlan, type FormBox } from "./box-pct.ts";

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

/**
 * 안내문이 "○○을 포트폴리오 명칭으로 작성한다(아니면 감점)"처럼 **이름으로 쓰라고 한 칸**. 칸 이름이 "문제 설정"이어도 "문제"가 대상이면 그 칸이다.
 * 왜(2026-11-27 가정-01): 칸 이름만 보고 문단 둘(4문장)을 썼다 — 안내문은 "저출산" 같은 이름 한 줄이고 아니면 감점이라고 했다.
 * 칸 이름과 요구 문장의 대상이 **정확히** 같을 때만(뒤의 설정·선정·항목 떼고) 잡는다 — "정책이 위의 문제를 해결…" 같은 긴 칸 이름이 "문제"에 걸리지 않게.
 */
const NAMED_AS = /([가-힣A-Za-z0-9]{2,12})\s*(?:을|를)\s*(?:[가-힣]{2,8}\s*)?(?:명칭|이름|제목)\s*(?:으로|로)\s*(?:작성|쓰|쓴|적|정)/g;
export function namedAsItems(items: string[] | undefined, requirements: string[] | undefined): string[] {
  const targets = new Set<string>();
  for (const r of requirements ?? []) for (const m of r.matchAll(NAMED_AS)) targets.add(m[1]);
  if (targets.size === 0) return [];
  const stem = (i: string) => i.replace(/\*\*/g, "").replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+/g, "").replace(/(?:설정|선정|항목|칸)$/, "");
  return (items ?? []).filter((i) => targets.has(stem(i)));
}

export function reflectionItems(items: string[] | undefined): string[] {
  return (items ?? []).filter((i) => REFLECT_ITEM.test(i.replace(/\*\*/g, "")));
}
export function nameOnlyItems(items: string[] | undefined): string[] {
  return (items ?? []).filter((i) => NAME_ONLY_ITEM.test(i.replace(/\*\*/g, "").trim()));
}

/** 필수 항목 블록 끝에 덧붙일 문장들(서지 칸 문장 + 칸 종류별 문장). 해당 칸이 없으면 빈 글. */
/** boxLimited: 안내문이 단계 전체의 줄·문장 상한을 정했다 — 그 조건이 우선이라 "길게"를 말하지 않는다(사회-03 칸 줄 수). */
export function itemShareNote(items: string[] | undefined, opts: { boxLimited?: boolean; boxes?: FormBox[]; requirements?: string[] } = {}): string {
  const base = valueFieldNote(items);
  // 근거 순서 ② 양식 칸 크기(사진에서 읽은 높이)가 ③ 칸 종류별 기본값보다 앞선다 — 칸을 읽었으면 그 숫자만 말한다.
  const boxPlan = itemBoxPlan(items, opts.boxes);
  if (boxPlan) return base + itemBoxNote(boxPlan);
  if (process.env.ITEM_SHARE_NOTE === "off" || opts.boxLimited) return base;
  const reflect = reflectionItems(items);
  const names = nameOnlyItems(items);
  const topics = topicItems(items);
  const named = namedAsItems(items, opts.requirements);
  if (reflect.length === 0 && names.length === 0 && topics.length === 0 && named.length === 0) return base;
  const quote = (a: string[]) => a.map((n) => `"${n}"`).join("·");
  const parts: string[] = [];
  if (reflect.length > 0) parts.push(`${quote(reflect)} 칸은 학생의 생각을 풀어 쓰는 칸이라 사실을 설명하는 항목보다 길게(2배 안팎) 쓴다.`);
  if (names.length > 0) parts.push(`${quote(names)} 칸은 이름만 적는 한 줄 칸이다.`);
  if (named.length > 0) parts.push(`${quote(named)} 칸은 안내문이 이름(명칭)으로 쓰라고 한 칸이다 — 설명 문장이 아니라 짧은 이름(명사구) 한 줄만 쓴다(이유·설명은 다른 칸에).`);
  if (topics.length > 0) parts.push(`${quote(topics)} 칸은 주제를 한두 문장으로 분명히 쓴다(배경·이유를 길게 풀지 말 것).`);
  return `${base}\n  ${parts.join(" ")}`;
}
