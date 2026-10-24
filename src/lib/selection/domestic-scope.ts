// 한국사·우리 사회를 다루는 과제인지(순수 함수 — alias import 없음). 그런 과제의 자동 선정 후보는 한국 대상으로만 좁힌다.
// 실측(2026-10-24): "1945.8.15~1948.8.15 현대사 신문"(과목 역사)에서 후보 생성이 "지역을 다양하게" 규칙을 따라 인도 독립·베를린 봉쇄·
// 체코슬로바키아 쿠데타 같은 외국 사건을 절반 넣었고, 조건에 "한국"이 없어 검증도 통과해 체코 쿠데타가 신문 대상으로 뽑혔다.

const KOREA_HINT = /한국|대한민국|우리나라|우리\s*사회|광복|해방|정부\s*수립|미군정|일제|조선|고려|신라|백제|고구려|발해|가야|4[·.]\s?19|5[·.]\s?18|6[·.]\s?25|민주화\s*운동|독립\s*운동|임시\s*정부|국내/;
const WORLD_HINT = /세계|외국|해외|국제|글로벌|각국|다른\s*나라|동아시아/;
/** 고등학교 "역사"는 한국사다(세계사·동아시아사는 과목명이 따로 있다). */
const KOREAN_HISTORY_SUBJECT = /^(역사|한국사|국사)$/;

export function isDomesticScope(subject: string, texts: string[]): boolean {
  const all = `${subject} ${texts.join(" ")}`;
  if (WORLD_HINT.test(all)) return false;
  return KOREAN_HISTORY_SUBJECT.test(subject.trim()) || KOREA_HINT.test(texts.join(" "));
}

export const DOMESTIC_CONSTRAINT = "한국(우리나라)의 역사·사회와 직접 관련된 대상일 것 — 외국에서 일어난 사건이나 외국 인물만 다루는 대상은 제외";
