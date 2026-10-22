// 단계가 여러 개인 글을 단계별로 동시에 쓰고 합친다(조사→글쓰기 경로). 글쓰기 시간은 출력 길이에 비례해서
// 4단계 글(약 3,000자)이 한 호출에 약 17초 걸렸다 — 단계마다 따로 쓰면 가장 긴 단계만큼만 걸린다.
// 모든 호출이 같은 프롬프트(사실 노트·전체 단계 설명)를 받고 끝에 "이 단계만 쓰라"는 지시만 다르다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

export function parallelWriteOn(labelCount: number): boolean {
  return labelCount >= 2 && process.env.ESSAY_PARALLEL_WRITE !== "off";
}

export function parallelWriteInstruction(label: string, labels: string[], withSummary: boolean): string {
  const others = labels.filter((l) => l !== label).map((l) => `"${l}"`).join(", ");
  return `
【이번 호출에서 쓸 부분 — 반드시 지킬 것】
이 과제의 단계(${labels.map((l) => `"${l}"`).join(", ")})는 여러 사람이 나눠서 동시에 쓴다. 너는 "## ${label}" 단계 하나만 쓴다.
${others ? `${others} 단계는 쓰지 말 것(그 단계의 내용은 위 단계 설명을 참고해 흐름만 맞춘다). ` : ""}책·인물·대상 이름과 사실은 위에 정해진 것만 쓴다(다른 단계와 어긋나지 않게).
${withSummary ? "맨 위에 과제 전체(모든 단계)를 요약한 불릿 3줄을 먼저 쓰고, 바로 이어서" : "맨 위 요약은 쓰지 말고 곧바로"} "## ${label}" 제목 줄부터 그 단계 본문을 쓴다.
`.trim();
}

const squash = (s: string) => s.replace(/[\s/·・,.\-–—()[\]{}<>「」『』"'*#:]/g, "").toLowerCase();

/** 한 호출의 출력에서 그 단계의 본문만 꺼낸다(제목을 못 찾으면 앞쪽 요약 불릿을 뺀 나머지 전체). */
function ownSection(text: string, label: string): string {
  const lines = text.split("\n");
  const want = squash(label);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = /^##(?!#)\s*(.*)$/.exec(lines[i]);
    if (m && (squash(m[1]) === want || (want.length >= 2 && squash(m[1]).startsWith(want)))) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) {
    const firstHeading = lines.findIndex((l) => /^##(?!#)/.test(l));
    if (firstHeading >= 0) return lines.slice(firstHeading + 1).join("\n").trim();
    let i = 0;
    while (i < lines.length && (/^\s*[-*•]\s/.test(lines[i]) || !lines[i].trim())) i++;
    return lines.slice(i).join("\n").trim();
  }
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^##(?!#)/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

/** 첫 호출의 요약 불릿 + 단계마다 "## 라벨" 본문을 이어 붙인 한 편의 글. */
export function mergeParallelParts(parts: string[], labels: string[]): string {
  const first = parts[0] ?? "";
  const firstHeading = first.split("\n").findIndex((l) => /^##(?!#)/.test(l));
  const summary = firstHeading > 0 ? first.split("\n").slice(0, firstHeading).join("\n").trim() : "";
  const body = labels.map((label, i) => `## ${label}\n\n${ownSection(parts[i] ?? "", label)}`).join("\n\n");
  return summary ? `${summary}\n\n${body}` : body;
}
