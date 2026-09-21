// 각주 표기의 최종 정리. 실측: "[5][5]", "[1][11][1]"처럼 같은 번호가 붙어서 반복되거나, 출처 목록에 없는 번호("[11]", "[2]")가 본문에 남는 일이 있었다.
/** 붙어 있는 각주 묶음([1][2][1])에서 중복 번호를 지운다(처음 등장 순서 유지). */
export function dedupeAdjacentMarkers(text: string): string {
  return text.replace(/(?:\[\d+\]){2,}/g, (group) => {
    const seen = new Set<string>();
    return (group.match(/\[\d+\]/g) ?? []).filter((m) => (seen.has(m) ? false : (seen.add(m), true))).join("");
  });
}

/** 출처 목록에 없는 번호의 각주를 지운다 — 학생이 눌러 볼 근거가 없는 각주는 남기지 않는다. */
export function dropDanglingMarkers(text: string, validNs: Set<number>): string {
  return text.replace(/\[(\d+)\]/g, (m, n: string) => (validNs.has(Number(n)) ? m : ""));
}

export function cleanMarkers(text: string, validNs: Set<number>): string {
  return dedupeAdjacentMarkers(dropDanglingMarkers(text, validNs));
}
