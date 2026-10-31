// 단계별로 보여 줄 각주 번호를 다시 매긴다.
// 예전에는 단계마다 따로 1번부터 매겼다. 그래서 한 장에 함께 제출하는 글인데도 단계마다 [1]이 다른 출처를 가리켰다 —
// 실측(2026-10-31, 사용자 결과물.6): "개요"는 [1]=전자신문·[2]=경향신문인데 "스토리보드"는 [1]=경향신문·[2]=전자신문이었다.
// 번호는 문서 전체에서 한 번만 매기고(처음 인용된 순서), 단계마다 그 단계가 실제로 쓴 번호만 보여 준다.
// 그 단계가 1번을 안 쓰면 [2]부터 시작할 수 있지만, 같은 번호가 두 가지를 뜻하는 것보다 낫다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

export interface NumberedSource {
  n: number;
}

export interface RenumberedSection<S> {
  content: string;
  sources: S[];
}

/**
 * 단계들을 순서대로 훑어 원래 번호 → 새 번호를 한 번만 정하고, 모든 단계에 같은 번호를 쓴다.
 * 출처 목록에 없는 번호는 지운다(눌러 볼 근거가 없는 각주).
 */
export function renumberAcrossSections<S extends NumberedSource>(
  contents: string[],
  allSources: S[]
): { sections: RenumberedSection<S>[]; sources: S[] } {
  const sourceByN = new Map(allSources.map((s) => [s.n, s]));
  const oldToNew = new Map<number, number>();
  let nextN = 1;
  for (const content of contents) {
    for (const m of content.matchAll(/\[(\d+)\]/g)) {
      const oldN = Number(m[1]);
      if (!sourceByN.has(oldN) || oldToNew.has(oldN)) continue;
      oldToNew.set(oldN, nextN++);
    }
  }
  const renumberOne = (content: string): RenumberedSection<S> => {
    const used = new Set<number>();
    const newContent = content.replace(/\[(\d+)\]/g, (_m, numStr: string) => {
      const newN = oldToNew.get(Number(numStr));
      if (newN === undefined) return "";
      used.add(newN);
      return `[${newN}]`;
    });
    const sources = [...oldToNew.entries()]
      .filter(([, newN]) => used.has(newN))
      .sort((a, b) => a[1] - b[1])
      .map(([oldN, newN]) => ({ ...sourceByN.get(oldN)!, n: newN }));
    return { content: newContent, sources };
  };
  const sections = contents.map(renumberOne);
  const sources = [...oldToNew.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([oldN, newN]) => ({ ...sourceByN.get(oldN)!, n: newN }));
  return { sections, sources };
}
