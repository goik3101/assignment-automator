// 완성 원고 프롬프트에 어떤 공통 규칙 블록을 넣을지 정한다.
// 실측(2026-10-20 프롬프트 8건): 글쓰기 프롬프트가 25~35KB였고, 그중 편지용 이름 빈칸 규칙·인물 업적 해석·방정환 예시·계산 과제 규칙처럼
// 그 과제와 무관한 블록이 절반 가까이였다. 무관한 금지 규칙이 쌓이면 모델이 "표현을 낮춰라"류 지시를 글 전체에 적용해 "~라는 기록이 있다" 같은
// 돌려 말하기가 늘었다(추정 — 블록별 단독 효과는 측정하지 않았다). 과제에 해당 신호가 있을 때만 넣는다.
// ESSAY_QUALITY_FIXES=off 또는 ESSAY_PROMPT_SCOPE=all이면 예전처럼 전부 넣는다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.
import { qualityFixesOn } from "./quality-flags.ts";

export interface RuleScope {
  /** 실존 인물 이름 처리·시점/화자 규칙(편지·고민·역할극·창작처럼 사람에게 말하거나 사람을 지어내는 글) */
  personAndPerspective: boolean;
  /** 인물 업적 해석 규칙(인물을 다루는 과제) */
  achievement: boolean;
  /** 역사적 사실 서술 규칙(역사·인물·사건, 계산 과제의 계산 규칙 포함) */
  factualRigor: boolean;
}

const PERSON_TEXT = /편지|메시지|카드|친구|고민|사연|상담|처방|역할극|소설|이야기|시나리오|희곡|인터뷰|대화문|짝꿍|부모님께|선생님께|에게\s*쓰/;
const ACHIEVEMENT_TEXT = /인물|위인|선구자|운동가|업적|생애|일대기|평전|위대한|본받|롤\s*모델/;
const HISTORY_TEXT = /역사|사건|전쟁|혁명|운동|시대|세기|독립|조선|고려|근대|현대사|왕조|제국|민주화|인권/;
const HISTORY_SUBJECT = /역사|한국사|세계사|동아시아|사회|윤리|도덕|정치/;
const CALC_TEXT = /계산|이자|금액|비용|예산|확률|환율|복리|단리/;

export function promptRuleScope(input: { subject: string; texts: string[]; hasPresetSubject: boolean }): RuleScope {
  if (!qualityFixesOn() || process.env.ESSAY_PROMPT_SCOPE === "all") return { personAndPerspective: true, achievement: true, factualRigor: true };
  const text = input.texts.join(" ");
  const achievement = input.hasPresetSubject || ACHIEVEMENT_TEXT.test(text);
  return {
    personAndPerspective: PERSON_TEXT.test(text),
    achievement,
    factualRigor: achievement || HISTORY_TEXT.test(text) || HISTORY_SUBJECT.test(input.subject) || CALC_TEXT.test(text),
  };
}
