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

/**
 * 앞 웨이브에서 이미 완성된 단계를 다음 단계 프롬프트에 그대로 넘긴다(step-order.ts가 순서를 정한다).
 * 사실 번호([F3])를 붙인 채로 넘겨서 뒤 단계가 같은 사실에 같은 번호를 달 수 있게 하는 것이 핵심이다 —
 * 번호가 없으면 그 단계는 출처가 0개가 되어 "검증 안 됨" 경고가 뜬다(실측 2026-10-29, 10회 중 1회).
 */
export function previousStepsBlock(done: { label: string; content: string }[]): string {
  const filled = done.filter((d) => d.content.trim());
  if (filled.length === 0) return "";
  return `
[이미 완성된 앞 단계 — 이 내용을 바탕으로 쓸 것]
${filled.map((d) => `## ${d.label}\n${d.content.trim()}`).join("\n\n")}

- 이 단계는 위 글을 바탕으로 쓴다. 위에 없는 사실(연도·수치·사건·기관 이름)을 새로 가져오지 말 것.
- 같은 사실을 쓸 때는 위 글에 붙은 번호를 그대로 붙일 것([F3]을 썼으면 여기서도 [F3]). 번호를 새로 만들지 말 것.
- 위 문장을 그대로 베끼지 말고, 이 단계의 형식과 독자에 맞는 새 문장으로 쓸 것.
`.trim();
}

/**
 * 단계가 하나뿐인 과제(평가지 한 장 등)는 단계별 동시 쓰기가 안 걸려 긴 글을 한 번에 쓴다 —
 * 실측(2026-10-30, 실제 사회 평가지): 조사 9.7초 + 글쓰기 17.6초로 글쓰기가 병목이었다.
 * 필수 항목이 넉넉하면 항목을 두 묶음으로 나눠 동시에 쓰고 항목 순서대로 이어 붙인다.
 */
export function itemGroups(items: string[] | undefined, min = 4): string[][] {
  const list = (items ?? []).filter((i) => i.trim());
  if (list.length < min) return [];
  const half = Math.ceil(list.length / 2);
  return [list.slice(0, half), list.slice(half)];
}

export function itemWriteInstruction(label: string, mine: string[], all: string[], withSummary: boolean): string {
  const others = all.filter((i) => !mine.includes(i));
  return `
【이번 호출에서 쓸 항목 — 반드시 지킬 것】
"## ${label}" 단계의 항목은 여러 사람이 나눠서 동시에 쓴다. 너는 ${mine.map((i) => `"${i}"`).join(", ")} 항목만 쓴다.
${others.length ? `${others.map((i) => `"${i}"`).join(", ")} 항목은 쓰지 말 것(다른 사람이 쓴다 — 그 항목 내용을 여기서 미리 설명하지도 말 것). ` : ""}사실·수치·각주 번호는 위 [사실 노트]에 있는 것만 쓴다.
${withSummary ? `맨 위에 과제 전체를 요약한 불릿 3줄을 먼저 쓰고, 이어서 "## ${label}" 제목 줄을 쓴 다음` : `"## ${label}" 제목 줄 없이 곧바로`} 네 항목의 "### 항목이름" 소제목부터 쓴다.
`.trim();
}

/** 항목 묶음별 출력에서 "### 항목" 부분만 모아 한 단계 본문으로 잇는다. */
export function mergeItemParts(parts: string[], label: string, withSummaryFirst = true): string {
  const first = parts[0] ?? "";
  const headIdx = first.split("\n").findIndex((l) => /^##(?!#)/.test(l) || /^###(?!#)/.test(l));
  const summary = withSummaryFirst && headIdx > 0 ? first.split("\n").slice(0, headIdx).join("\n").trim() : "";
  const bodies = parts.map((p) => {
    const lines = ownSection(p, label).split("\n");
    const start = lines.findIndex((l) => /^###(?!#)/.test(l));
    return (start >= 0 ? lines.slice(start) : lines).join("\n").trim();
  });
  const body = `## ${label}\n\n${bodies.filter(Boolean).join("\n\n")}`;
  return summary ? `${summary}\n\n${body}` : body;
}

const squash = (s: string) => s.replace(/[\s/·・,.\-–—()[\]{}<>「」『』"'*#:]/g, "").toLowerCase();

/** 한 호출의 출력에서 그 단계의 본문만 꺼낸다(제목을 못 찾으면 앞쪽 요약 불릿을 뺀 나머지 전체). */
export function ownSection(text: string, label: string): string {
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
