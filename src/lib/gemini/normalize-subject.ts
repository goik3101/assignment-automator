// 분석 결과의 과목명 정리. 모델에 따라 "국어 수행평가: 나의 특별한 하루"처럼 제목까지 붙여 돌려주는 경우가 있어서(gpt-5-mini 실측),
// 뒤 단계 프롬프트에 그대로 쓰이는 이 필드를 과목명만 남기도록 코드로 정리한다.
export function normalizeSubject(raw: string): string {
  let s = raw.trim();
  s = s.replace(/[\[\]【】()（）]/g, " ");
  s = s.split(/[:：\-–—|·]/)[0].trim(); // 콜론·하이픈 뒤의 제목 제거
  s = s.replace(/\s*(수행평가|안내문|과제|평가)\s*$/g, "").trim();
  s = s.replace(/\s*(수행평가|안내문)\s*/g, " ").trim();
  // 그래도 길면 첫 단어(과목명은 보통 한 단어: 국어, 통합사회, 한국지리)
  if (s.length > 12 && s.includes(" ")) s = s.split(/\s+/)[0];
  return s.slice(0, 20);
}
