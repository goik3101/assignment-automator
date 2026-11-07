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

/**
 * 붙어 있는 각주를 하나로 합친다: "[1][2]" → "[1,2]".
 *
 * 왜(2026-11-07, 사용자): 본문 한가운데 "[1][2]", "[3][2]"처럼 대괄호가 겹쳐 읽기가 나쁘다.
 * 출처는 우리 서비스의 핵심이라 **뺄 수는 없고**(안내문 여럿이 출처 표시를 요구한다),
 * 괄호 수를 줄여 글자 흐름을 덜 끊는다. 번호는 오름차순으로 정리한다 — 뒤의 출처 목록 순서와 맞춘다.
 * 화면에서 더 작게 보이게 하는 것은 별개 문제다(표시 방식).
 */
export function mergeAdjacentMarkers(text: string): string {
  return text.replace(/(?:\[\d+\]){2,}/g, (group) => {
    const ns = [...new Set((group.match(/\[(\d+)\]/g) ?? []).map((m) => Number(m.slice(1, -1))))].sort((a, b) => a - b);
    return `[${ns.join(",")}]`;
  });
}
