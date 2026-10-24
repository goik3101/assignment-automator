// 사용 횟수 예약의 순수 규칙(alias import 없음 — node:test에서 바로 불러올 수 있게).

/** 시간순으로 정렬된 오늘 기록 id 목록에서 내 기록이 한도 안(앞쪽 limit개)인지. 동시에 들어온 요청은 먼저 들어간 순서대로 통과한다. */
export function withinLimit(orderedIds: string[], myId: string, limit: number): boolean {
  const idx = orderedIds.indexOf(myId);
  return idx >= 0 && idx < limit;
}
