// 단계 사이의 의존 관계를 읽어 "동시에 써도 되는 묶음(웨이브)"을 정한다.
// 지금까지 단계별 동시 글쓰기(parallel-write.ts)는 모든 단계를 한꺼번에 써서, 안내문이 "개요에서 생성한 내용을 바탕으로
// 스토리보드를 작성"이라고 요구해도 스토리보드 호출이 개요 본문을 볼 수 없었다(실측 2026-10-29, 10회: 개요에 없는 수치가
// 스토리보드에 나온 것 3회, 스토리보드에 각주가 하나도 없어 출처 경고가 뜬 것 1회).
// 의존 표현이 있을 때만 순서를 만든다 — "개요와 스토리보드를 모두 작성하며"처럼 두 단계를 함께 말하기만 한 문장은 순서가 아니다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.

export interface OrderElement {
  label: string;
  description: string;
}

/** "앞 단계의 결과를 받아서 쓴다"는 뜻의 표현. 이 표현이 있을 때만 단계 사이에 순서를 만든다. */
const DEP_CUE =
  /바탕으로|토대로|기반으로|정리한\s*내용|생성한\s*내용|작성한\s*내용|수집한\s*(?:자료|내용|정보)|조사한\s*(?:자료|내용|정보)|이어받아|앞\s*단계|앞서\s*(?:작성|정리|조사|수집)한|참고(?:하여|해서|해)|활용(?:하여|해서|해)/g;

const norm = (s: string) => s.replace(/[\s()[\]{}<>"'`·・,.:;!?~\-–—/]/g, "").toLowerCase();

/** 글 text에서 needle이 at보다 왼쪽에 나오는 위치 중 at에 가장 가까운 거리(없으면 Infinity). */
function nearestLeft(text: string, needle: string, at: number): number {
  let best = Infinity;
  for (let i = text.indexOf(needle); i >= 0 && i < at; i = text.indexOf(needle, i + 1)) best = Math.min(best, at - i);
  return best;
}

/**
 * 한 문장에서 "A의 결과를 받아 B를 쓴다"는 간선을 뽑는다.
 * 의존 표현 바로 왼쪽에 가장 가까운 단계 이름이 A다 — 어순이 바뀌어도("스토리보드는 개요의 내용을 바탕으로") 같은 결과가 나온다.
 * targets가 주어지면 그 단계가 B다(단계 설명을 읽을 때). 아니면 그 문장이 언급한 나머지 단계가 전부 B다.
 */
function edgesFromSentence(sentence: string, labels: string[], target?: string): [string, string][] {
  const text = norm(sentence);
  const mentioned = labels.filter((l) => norm(l).length >= 2 && text.includes(norm(l)));
  if (mentioned.length === 0) return [];
  const out: [string, string][] = [];
  DEP_CUE.lastIndex = 0;
  for (const m of sentence.matchAll(DEP_CUE)) {
    const at = norm(sentence.slice(0, m.index ?? 0)).length;
    let from: string | null = null;
    let best = Infinity;
    for (const l of mentioned) {
      if (l === target) continue;
      const d = nearestLeft(text, norm(l), at);
      if (d < best) {
        best = d;
        from = l;
      }
    }
    if (!from) continue;
    const tos = target ? [target] : mentioned.filter((l) => l !== from);
    for (const to of tos) if (to !== from) out.push([from, to]);
  }
  return out;
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.。!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

/** 단계 사이의 의존 간선(A → B = A를 먼저 써야 B를 쓸 수 있다). */
export function stepDependencies(elements: OrderElement[], requirements: string[] = [], guide?: string): [string, string][] {
  const labels = elements.map((e) => e.label);
  const edges: [string, string][] = [];
  const add = (list: [string, string][]) => {
    for (const [a, b] of list) if (!edges.some(([x, y]) => x === a && y === b)) edges.push([a, b]);
  };
  for (const el of elements) for (const s of splitSentences(el.description)) add(edgesFromSentence(s, labels, el.label));
  for (const s of [...requirements.flatMap(splitSentences), ...splitSentences(guide ?? "")]) add(edgesFromSentence(s, labels));
  return edges;
}

/**
 * 동시에 써도 되는 단계 묶음을 순서대로 돌려준다. 의존이 없으면 묶음 하나(= 지금처럼 전부 동시).
 * 묶음 수는 maxWaves로 제한한다 — 사슬이 길면 전부 직렬이 되어 생성 시간이 그만큼 늘어난다(글쓰기 호출 하나가 실측 6.5~8.5초).
 * 순환이 생기는 간선은 버린다(안내문 문장이 서로를 가리키는 경우).
 */
export function stepWaves(elements: OrderElement[], requirements: string[] = [], guide?: string, maxWaves = 2): string[][] {
  const labels = elements.map((e) => e.label);
  if (labels.length <= 1 || maxWaves <= 1) return [labels];
  const edges = stepDependencies(elements, requirements, guide);
  const deps = new Map<string, string[]>(labels.map((l) => [l, []]));
  for (const [a, b] of edges) if (deps.has(b) && deps.has(a)) deps.get(b)!.push(a);

  const level = new Map<string, number>();
  const levelOf = (label: string, seen: Set<string>): number => {
    if (level.has(label)) return level.get(label)!;
    if (seen.has(label)) return 0; // 순환 — 이 간선은 없는 것으로 본다
    seen.add(label);
    const mine = deps.get(label)!.reduce((acc, d) => Math.max(acc, levelOf(d, seen) + 1), 0);
    seen.delete(label);
    level.set(label, mine);
    return mine;
  };
  for (const l of labels) levelOf(l, new Set());

  const waves: string[][] = [];
  for (const l of labels) {
    const i = Math.min(level.get(l)!, maxWaves - 1);
    (waves[i] ??= []).push(l);
  }
  return waves.filter((w) => w && w.length > 0);
}
