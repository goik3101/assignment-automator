// 열리지 않는 페이지("없는 페이지")만 근거로 든 **수치 문장**을 지운다. alias import 없음 — node:test에서 바로 불러온다.
//
// 왜(2026-11-18 사용자 테스트, 사회 탐구주제선정): 출처 [1]이 "없는 페이지"로 표시되는데 본문은 그 페이지의 수치(농가 고령인구 52.6%, 전년보다 2.8%포인트)를
// 그대로 인용했다. 학생이 확인할 수 없는 숫자를 제출하게 된다. 죽은 출처만 가리키고 숫자가 든 문장은 지운다 — 숫자 없는 설명 문장은 남기되 각주만 뗀다.
const CITE = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

export function dropDeadSourceFigures(content: string, deadNs: number[]): { content: string; removed: string[] } {
  if (deadNs.length === 0) return { content, removed: [] };
  const dead = new Set(deadNs.map(String));
  const removed: string[] = [];
  const lines = content.split("\n").map((line) => {
    if (/^\s*#{1,6}\s/.test(line) || /^\s*\|/.test(line)) return line;
    const parts = line.split(/(?<=[.!?。](?:\[\d+(?:\s*,\s*\d+)*\])*)\s+/);
    const kept: string[] = [];
    for (const p of parts) {
      const ns = [...p.matchAll(CITE)].flatMap((m) => m[1].split(",").map((x) => x.trim()));
      const onlyDead = ns.length > 0 && ns.every((n) => dead.has(n));
      if (onlyDead && /\d/.test(p.replace(CITE, ""))) {
        removed.push(p.slice(0, 40));
        continue;
      }
      // 죽은 출처 번호만 떼고(다른 출처가 함께 있으면 그것은 남긴다)
      kept.push(
        p.replace(CITE, (m, g: string) => {
          const rest = g.split(",").map((x) => x.trim()).filter((n) => !dead.has(n));
          return rest.length ? `[${rest.join(",")}]` : "";
        })
      );
    }
    return kept.join(" ");
  });
  return { content: lines.join("\n").replace(/[ \t]+([.,!?])/g, "$1"), removed };
}
