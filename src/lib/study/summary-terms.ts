// 요약의 "핵심 용어"에서 **개념이 아닌 말**을 코드가 걸러 낸다. alias import 없음 — node:test에서 바로 불러옴.
//
// 왜(2026-11-15, 사용자 실사용: 과학 멸치 결과물의 요약): 용어 칸에 "관찰 지침", "예상과 실제 관찰", "영양단계의 연결", "예상 결과"처럼
// **과제를 진행하는 말·문서 구조**가 올라오고, 정작 생산자·소비자·분해자 같은 교과 개념은 없었다. 프롬프트로 "개념만 고를 것"을 적어도
// 모델이 새 말을 지어 붙이는 경우가 남아서, 두 가지를 코드로 본다: ① 용어가 **자료에 실제로 나온 낱말인가**(지어낸 합성어 제거)
// ② 과제 진행·문서 구조를 가리키는 말이 아닌가.

const META_TERM = /지침|예상|결과물|보고서|항목|계획|제출|평가|작성|단계\s*이름|도식|관찰\s*결과|실험\s*방법|준비물/;

const squash = (s: string) => s.replace(/[\s·・,.()「」『』"'“”‘’\-–—:]/g, "");

export function filterKeyTerms<T extends { term: string; meaning: string }>(terms: T[], material: string): T[] {
  const body = squash(material);
  const ok = terms.filter((k) => {
    const term = squash(k.term ?? "");
    if (term.length < 2) return false;
    if (META_TERM.test(k.term)) return false;
    return body.includes(term);
  });
  // 전부 걸러지면(자료가 짧거나 표기가 달라서) 모델 목록을 그대로 쓴다 — 빈 칸보다 낫다.
  return ok.length >= 2 ? ok : terms.filter((k) => !META_TERM.test(k.term ?? ""));
}
