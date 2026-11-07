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

/**
 * 문장마다 붙은 각주를 **문단(또는 목록 항목) 끝에 한 번**으로 모은다. **화면 표시 전용**이다.
 *
 * 왜(2026-11-08, 사용자): "출처를 빼라는 게 아니라 글 한가운데 [1],[2]가 들어가는 게 읽기 나쁘다."
 * 대표 출처 하나만 남기는 방식은 쓰지 않았다 — 우리는 문장별로 출처 페이지와 대조해 틀린 사실을 걸러내므로
 * (claim-check) 문단↔출처 연결이 끊기면 그 검사의 근거가 사라진다. 문단 단위로 모으면 각주 개수가
 * 3~5분의 1로 줄고 추적은 남는다. 안내문이 "근거마다 출처"를 요구하는 과제는 근거가 목록 항목이라
 * 항목마다 하나가 남아 그대로 충족된다.
 *
 * **저장된 원문은 바꾸지 않는다** — 재생성의 기준이고, 결함 검사 여러 개가 문장별 각주를 센다.
 * 건드리지 않는 줄: 소제목, 표(|), 코드 블록, 맨 아래 출처 목록.
 */
export function collapseMarkersToBlockEnd(markdown: string): string {
  const lines = markdown.split("\n");
  const out: string[] = [];
  let inCode = false;
  // 문단은 빈 줄로 끊긴다. 목록 항목·소제목은 그 줄 하나가 한 묶음이다.
  let buf: string[] = [];

  const flush = () => {
    if (buf.length === 0) return;
    const text = buf.join("\n");
    const ns = [...new Set((text.match(/\[\d+(?:,\d+)*\](?!\()/g) ?? []).flatMap((m) => m.slice(1, -1).split(",").map(Number)))].sort((a, b) => a - b);
    if (ns.length === 0) {
      out.push(...buf);
    } else {
      // "[1](주소)"는 각주가 아니라 마크다운 링크다 — 뒤에 "("가 오면 떼지 않는다.
      const stripped = text.replace(/\s*\[\d+(?:,\d+)*\](?!\()/g, "");
      // 각주는 마지막 문장 부호 뒤가 아니라 문단 맨 끝에 붙인다 — 문장 중간에서 흐름을 끊지 않는다.
      out.push(...`${stripped.replace(/\s+$/, "")} [${ns.join(",")}]`.split("\n"));
    }
    buf = [];
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flush();
      inCode = !inCode;
      out.push(line);
      continue;
    }
    // 소제목·표·빈 줄·목록 항목은 묶음 경계다.
    const isBoundary = inCode || /^\s*$/.test(line) || /^\s*#{1,6}\s/.test(line) || line.includes("|");
    const isListItem = /^\s*(?:[-*+]|\d+[.)])\s/.test(line);
    if (isBoundary) {
      flush();
      out.push(line);
      continue;
    }
    if (isListItem) flush();
    buf.push(line);
  }
  flush();
  return out.join("\n");
}

/** 화면에 그릴 때만 거치는 각주 정리: 문단 끝으로 모으고, 소제목·표에 남은 묶음은 하나로 합친다. */
export function markersForDisplay(markdown: string): string {
  return mergeAdjacentMarkers(collapseMarkersToBlockEnd(markdown));
}
