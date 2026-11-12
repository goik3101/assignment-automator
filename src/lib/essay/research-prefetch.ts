// **조사를 사람이 기다리는 시간 뒤로 숨긴다.**
//
// 왜(2026-11-12 호출별 실측): generateEssay의 직렬 구간은 조사 8~13초 → 글쓰기 13~24초 → 대조 2~5초다.
// ChatGPT는 호출 1건(12.6~32.9초)이고 우리가 더 쓰는 시간의 대부분이 **조사 한 호출**인데, 그 조사가
// 바로 우리 차별점(실제 출처·각주)이라 없앨 수는 없다. 없앨 수 없으면 **옮긴다**.
//
// 화면 흐름은 analyze → 분석 결과 확인 → 모드 선택 → 제작 전 질문 2~4개 → 생성이다.
// 학생이 "AI가 만들어줘요"를 고른 순간부터 질문에 답하는 동안 10~30초가 비는데, 그 사이에 조사를 돌려 두면
// 생성이 시작될 때 노트가 이미 있다. generateEssay는 `researchNotes`가 들어오면 조사 호출을 통째로 건너뛴다.
//
// **다양성에 영향이 없게** 만든 두 가지(조사 노트 캐시가 기본 꺼짐인 이유가 그것이다):
//   - **한 번 쓰면 사라진다**(takePrefetchedResearch). 다른 학생이 같은 안내문으로 와도 남은 것이 없다.
//   - **3분 뒤 사라진다**. 서버 메모리에만 있고 DB에 쓰지 않는다.
// 그래서 "같은 과제 학생끼리 사실·출처를 공유"하는 일이 생기지 않는다 — 자기가 띄운 것을 자기가 쓴다.
//
// alias import 없음 — node:test에서 바로 불러옴.

export interface PrefetchKeyParts {
  subject: string;
  topic: string;
  /** 단계 이름(순서 그대로) — 과제가 다르면 조사도 달라야 한다. */
  labels: string[];
  /** 학생이 고른 대상·주제. 이것이 바뀌면 미리 한 조사는 **버린다**. */
  studentTopic: string;
}

export function prefetchKey(p: PrefetchKeyParts): string {
  return [p.subject, p.topic, p.labels.join("|"), p.studentTopic].map((s) => (s ?? "").trim()).join("§");
}

const TTL_MS = 3 * 60 * 1000;
const MAX_ENTRIES = 50;

type Entry<T> = { at: number; value: Promise<T> };
const store = new Map<string, Entry<unknown>>();

function sweep(now: number) {
  for (const [k, e] of store) if (now - e.at > TTL_MS) store.delete(k);
  // 서버 메모리에 쌓이지 않게 가장 오래된 것부터 버린다.
  while (store.size > MAX_ENTRIES) {
    const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (!oldest) break;
    store.delete(oldest[0]);
  }
}

/**
 * 조사를 지금 시작해 두고, 같은 열쇠로 찾아갈 수 있게 둔다.
 * 이미 같은 열쇠로 돌고 있으면 새로 시작하지 않는다(두 번 누르는 경우).
 */
export function startPrefetch<T>(key: string, run: () => Promise<T>): void {
  const now = Date.now();
  sweep(now);
  if (store.has(key)) return;
  // 아무도 안 찾아가도 터지지 않게 한다 — 실패는 가져갈 때 null로 바뀐다.
  const value = run().catch(() => null as T);
  store.set(key, { at: now, value: value as Promise<unknown> });
}

/** 미리 해 둔 조사를 **가져가며 지운다**. 없으면 null. */
export async function takePrefetchedResearch<T>(key: string): Promise<T | null> {
  const now = Date.now();
  sweep(now);
  const hit = store.get(key);
  if (!hit) return null;
  store.delete(key);
  if (now - hit.at > TTL_MS) return null;
  try {
    return (await hit.value) as T | null;
  } catch {
    return null;
  }
}

/** 테스트·운영 점검용. */
export function prefetchSize(): number {
  return store.size;
}

export function clearPrefetch(): void {
  store.clear();
}

export function researchPrefetchOn(): boolean {
  return process.env.RESEARCH_PREFETCH !== "off";
}
