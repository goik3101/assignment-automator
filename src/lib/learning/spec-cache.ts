// 대상 선정 "사양"(어떤 종류의 대상을 고르라는 과제인가, 조건·제외 대상은 무엇인가)을 **같은 안내문끼리 재사용**한다.
// alias import 없음 — node:test에서 바로 불러올 수 있게.
//
// 왜(2026-11-10, 역사 신문 생성 1회의 호출별 실측): 자동 대상 선정이 **25.5초**를 썼다 —
// `learning:subject-spec` 6.0초 → `selection:candidates` 13.0초 → `learning:verify-candidates` 6.5초가 직렬이고,
// 그 25.5초가 전부 `generateEssay` 안에서 흐른다. 그래서 그 실행은 첫 보완 관문에서 이미 41.9초를 쓴 상태였고
// 생성이 47.5초로 끝났다(30초 목표의 1.6배). 세 단계 중 **사양만은 학생과 무관하다.**
//
// **다양성에 영향이 없다**(이 저장소에서 조사 노트 캐시를 기본 꺼짐으로 둔 이유와 다르다):
// 조사 노트 캐시는 모든 학생에게 **같은 사실과 같은 출처**를 줘서 결과물을 닮게 만든다.
// 사양은 "인물을 고르는 과제다 / 제도·기관은 제외다" 같은 **안내문 해석**이고, 후보 생성과 실제 선택
// (`selection:candidates`·점수·쏠림 억제)은 학생마다 그대로 돈다. 같은 안내문을 받은 학생들은 어차피
// 같은 사양 아래에서 고른다 — 사양이 실행마다 흔들리는 것이 오히려 결과를 갈랐다.
//
// 열쇠에 학생 지침까지 넣는다 — 지침에 대상이 적혀 있으면(`student_specified_subject`) 결과가 달라지기 때문이다.
// 지침을 비워 둔 학생끼리는 열쇠가 같아져, **자동 선정이 도는 바로 그 경우에** 캐시가 맞는다.
//
// 되돌리기: `SUBJECT_SPEC_CACHE=off`. 서버 메모리에만 둔다(마이그레이션 없음) — 배포가 갈려도 틀린 답이 남지 않고,
// 최악의 경우 캐시가 비어 예전과 같은 시간이 걸릴 뿐이다.

export interface SpecCacheEntry<T> {
  value: T;
  at: number;
}

/** 한 서버 인스턴스가 들고 있을 안내문 수. 넘으면 가장 오래된 것부터 버린다. */
const MAX_ENTRIES = 200;
/** 안내문 분석이 바뀌면 열쇠도 바뀌므로 길게 둬도 되지만, 메모리를 오래 붙잡지 않게 6시간으로 끊는다. */
const TTL_MS = 6 * 60 * 60 * 1000;

export function specCacheOn(): boolean {
  return process.env.SUBJECT_SPEC_CACHE !== "off";
}

/** 문자열 하나로 접는 값싼 해시(암호용이 아니다 — 같은 안내문을 같은 열쇠로 모으는 것이 목적). */
export function specCacheKey(parts: (string | null | undefined)[]): string {
  const text = parts.map((p) => (p ?? "").trim()).join("\u0001");
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = (h1 ^ c) * 16777619 >>> 0;
    h2 = (h2 + c * (i + 1)) >>> 0;
  }
  return `${h1.toString(36)}-${h2.toString(36)}-${text.length}`;
}

/** 테스트와 운영이 같은 구현을 쓰도록 캐시를 클래스 없이 만든다. */
export function createSpecCache<T>(now: () => number = () => Date.now()) {
  const store = new Map<string, SpecCacheEntry<T>>();
  return {
    get(key: string): T | undefined {
      if (!specCacheOn()) return undefined;
      const hit = store.get(key);
      if (!hit) return undefined;
      if (now() - hit.at > TTL_MS) {
        store.delete(key);
        return undefined;
      }
      // 최근 쓴 것을 뒤로 보내 오래된 것부터 버려지게 한다
      store.delete(key);
      store.set(key, hit);
      return hit.value;
    },
    set(key: string, value: T): void {
      if (!specCacheOn()) return;
      store.delete(key);
      store.set(key, { value, at: now() });
      while (store.size > MAX_ENTRIES) {
        const oldest = store.keys().next();
        if (oldest.done) break;
        store.delete(oldest.value);
      }
    },
    get size(): number {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
  };
}
