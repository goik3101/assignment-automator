"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";

export type StudyRef = { kind: "history" | "learning" | "submission"; id: string };

interface CacheEntry<T> {
  at: number;
  data: T;
}

const PREFIX = "studed-study:";

function readCache<T>(key: string, ttlMs: number): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (typeof entry.at !== "number" || Date.now() - entry.at > ttlMs) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data } satisfies CacheEntry<T>));
  } catch {
    // 저장소가 가득 찼거나 막힌 환경 — 캐시 없이 동작한다.
  }
}

/**
 * 학습 도구(요약·카드·퀴즈·시험)가 서버에서 만들어 온 결과를 불러오는 훅. 같은 과제의 같은 도구는 브라우저에 저장해 두고
 * (결과물은 바뀌지 않으므로) 다시 열 때 AI를 또 부르지 않는다. "다시 만들기"는 refresh()로.
 */
export function useStudyData<T>(ref: StudyRef, tool: string, body: Record<string, unknown> = {}, ttlMs = Infinity) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState<number | null>(null);
  const bodyRef = useRef(body);
  // 화면 언어가 바뀌면 다른 언어로 만든 자료를 다시 쓰지 않도록 언어를 키에 넣는다(서버가 쿠키의 언어로 만든다).
  const { lang } = useLang();
  const cacheKey = `${ref.kind}:${ref.id}:${tool}:${lang}`;

  const load = useCallback(
    async (force: boolean) => {
      setError(null);
      if (!force) {
        const hit = readCache<T>(cacheKey, ttlMs);
        if (hit) {
          setData(hit.data);
          setFromCache(hit.at);
          setLoading(false);
          return;
        }
      }
      setLoading(true);
      setFromCache(null);
      try {
        const res = await fetch(`/api/study/${tool}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context: ref, ...bodyRef.current }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json as { error?: string }).error ?? "불러오지 못했어요.");
        setData(json as T);
        writeCache(cacheKey, json as T);
      } catch (err) {
        setError(err instanceof Error ? err.message : "불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      } finally {
        setLoading(false);
      }
    },
    [cacheKey, ref, tool, ttlMs]
  );

  useEffect(() => {
    // 마운트(또는 대상이 바뀔 때) 한 번 불러온다 — 데이터 로딩의 표준 패턴.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(false);
  }, [load]);

  return { data, error, loading, fromCache, refresh: () => load(true) };
}

/** 이 과제에서 학생이 직접 고른 결과(예: 퀴즈 점수)를 기억해 두는 작은 저장소. */
export function loadLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function saveLocal<T>(key: string, value: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/** 이 과제에서 이미 만들어 브라우저에 저장된 학습 자료(도구별 마지막 생성 시각) — 공부 도구의 "내 학습" 목록용. */
export function listSavedStudy(ref: StudyRef, lang: string): { tool: string; at: number }[] {
  const head = `${PREFIX}${ref.kind}:${ref.id}:`;
  const tail = `:${lang}`;
  const out: { tool: string; at: number }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(head) || !key.endsWith(tail)) continue;
      const tool = key.slice(head.length, key.length - tail.length);
      const entry = JSON.parse(localStorage.getItem(key) ?? "null") as CacheEntry<unknown> | null;
      if (tool && typeof entry?.at === "number") out.push({ tool, at: entry.at });
    }
  } catch {
    // 저장소가 막힌 환경 — 목록 없이 동작한다.
  }
  return out;
}
