// 작성 기준(writing_guide)에 적힌 **양식 칸 이름**을 읽는다. alias import 없음 — node:test에서 바로 불러옴.
//
// 왜(2026-11-11, 사회 "경제적 유인"): 분석이 2번 양식의 `required_items`를 5개로 잡아
// 마지막 칸("위에서 분석한 결과를 바탕으로 두 유인을 결합하거나 보완한 최적의 정책 제시")을 빠뜨렸는데,
// **같은 분석의 writing_guide에는 그 칸이 적혀 있었다**("'최적의 정책 제시' 약 5줄").
// 이 저장소가 이미 아는 교훈과 같다 — 분석이 만든 **구조**(required_items)는 흔들리고,
// 안내문 글을 읽는 쪽은 안정적이다. 그래서 구조만 믿지 말고 글에서 읽은 것과 합친다.
//
// 칸 이름은 작성 기준이 "'<칸 이름>' 약 N줄"처럼 **따옴표로 묶어** 적는다(분석 프롬프트가 그렇게 시킨다).

const QUOTED = /[‘'"“]([^’'"”]{2,40})[’'"”]\s*(?:칸|란)?\s*(?:은|는|에)?\s*(?:각각\s*)?약?\s*\d+\s*줄/g;

/** 작성 기준에서 "'이름' 약 N줄" 꼴로 적힌 칸 이름들. 없으면 빈 배열. */
export function formFieldsFromGuide(guide: string | undefined): string[] {
  const out: string[] = [];
  for (const m of (guide ?? "").matchAll(QUOTED)) {
    const name = m[1].trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/**
 * 그 단계의 필수 항목에 **작성 기준에만 적힌 칸**을 더한다. 이름이 거의 같은 것은 더하지 않는다
 * ("문제 행동" vs "관심 분야에서 해결하고 싶은 문제 행동").
 */
export function mergeGuideFields(required: string[] | undefined, guide: string | undefined): string[] {
  const have = (required ?? []).map((x) => x.trim()).filter(Boolean);
  // 같은 칸인지는 **낱말이 겹치는가**로 본다. 글자를 통째로 비교하면 "한계점 혹은 부작용"과
  // "기획한 경제적 유인의 한계점 혹은 발생 가능한 부작용"이 서로를 포함하지 않아 두 번 들어간다(실측).
  const COMMON = /^(?:혹은|또는|그리고|및|위에서|아래|다음|각각|관련|대한|위한|있는|하고|싶은|해야|할)$/;
  const words = (x: string) =>
    x
      .replace(/[^가-힣A-Za-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((w) => w.replace(/(?:의|을|를|이|가|은|는|에|로|으로)$/, ""))
      .filter((w) => w.length >= 2 && !COMMON.test(w));
  const out = [...have];
  for (const f of formFieldsFromGuide(guide)) {
    const fw = words(f);
    if (fw.length === 0) continue;
    const dup = out.some((h) => {
      const hw = new Set(words(h));
      const shared = fw.filter((w) => hw.has(w)).length;
      return shared >= Math.min(2, fw.length);
    });
    if (dup) continue;
    out.push(f);
  }
  return out;
}
