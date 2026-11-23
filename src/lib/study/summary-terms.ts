// 요약의 "개념"에서 **개념이 아닌 말**을 코드가 걸러 낸다. alias import 없음 — node:test에서 바로 불러옴.
//
// 왜(2026-11-15, 과학 멸치 요약): "관찰 지침", "예상과 실제 관찰", "영양단계의 연결"처럼 과제를 진행하는 말·문서 구조가 개념 칸에 올라왔다.
// ① 용어가 **자료에 실제로 나온 낱말인가**(지어낸 합성어 제거) ② 과제 진행 말 **그 자체**인가.
// 2026-11-23: ②를 "평가·계획·작성…이 들어간 말은 전부"에서 **그 말 자체일 때만**으로 좁혔다 — "형성평가·사업계획서·자기평가" 같은 진짜 개념이 지워졌다.
// 진행 말을 고르지 않게 하는 일은 이제 프롬프트(CONCEPT_PICK)가 하고, 여기는 확실한 것만 거른다.

const META_TERM =
  /^(?:관찰\s*지침|예상(?:\s*결과|과\s*실제\s*관찰)?|결과물|보고서(?:\s*항목)?|실험\s*(?:계획|방법)|준비물|작성\s*요령|제출\s*방법|단계\s*이름|도식|관찰\s*결과|평가\s*기준표?|작성\s*방법)$/;

const squash = (s: string) => s.replace(/[\s·・,.()「」『』"'“”‘’\-–—:]/g, "");

export function filterKeyTerms<T extends { term: string; meaning: string }>(terms: T[], material: string, opts?: { skipMaterialCheck?: boolean }): T[] {
  const notMeta = terms.filter((k) => !META_TERM.test((k.term ?? "").trim()));
  // 화면 언어가 영어면 용어를 영어로 쓰므로 한국어 자료에 그 낱말이 있는지 볼 수 없다.
  if (opts?.skipMaterialCheck) return notMeta;
  const body = squash(material);
  const ok = notMeta.filter((k) => {
    const term = squash(k.term ?? "");
    return term.length >= 2 && body.includes(term);
  });
  // 전부 걸러지면(자료가 짧거나 표기가 달라서) 모델 목록을 그대로 쓴다 — 빈 칸보다 낫다.
  return ok.length >= 2 ? ok : notMeta;
}
