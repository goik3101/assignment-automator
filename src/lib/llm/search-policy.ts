// 웹 검색이 "실제로 필요한" 과제인지 판별한다. 검색은 호출당 요금($0.01)이 붙으므로, 사실 조사가 필요 없는 창작·계산·기획형 과제에는
// 검색을 강제하지 않는다(도구는 켜 두어 모델이 필요하면 쓰게 한다). 판별이 애매하면 검색을 강제하는 쪽(기본 true)으로 한다 —
// 출처가 필요한 과제에서 검색을 빼먹는 것이 더 큰 문제이기 때문이다.
const FACT_HINT = /조사|출처|자료|통계|근거|인물|사건|역사|책|도서|독서|저자|인용|업적|연구|현황|사례|법|제도|정책|뉴스|기사|원리|이론|실험|탐구/;
const CREATIVE_HINT = /신조어|창작|시를|자유시|일기|편지|소설|나의 (?:하루|경험|다짐|꿈)|경험 에세이|수식|계산|앱\s*(?:기획|서비스)|포스터|캐릭터|광고 문구|슬로건/;

export function needsFactSearch(...texts: (string | undefined | null)[]): boolean {
  const t = texts.filter(Boolean).join(" ");
  if (!t.trim()) return true;
  if (CREATIVE_HINT.test(t) && !FACT_HINT.test(t)) return false;
  return true;
}
