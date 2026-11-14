"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";

/**
 * `key`는 **브라우저 저장용 이름표**다. 같은 결과물이 방금 만든 화면에서는 submission id로, 기록 화면에서는 history id로 열려
 * 저장 키가 달라 "요약이 저장이 안 된다"(열 때마다 새로 만듦)로 보였다(2026-11-15). 둘 다 submission id로 같은 키를 쓰게 한다.
 * 서버에는 kind·id만 간다.
 */
export type StudyRef = { kind: "history" | "learning" | "submission" | "tutor"; id: string; key?: string };

const baseOf = (ref: StudyRef) => ref.key ?? `${ref.kind}:${ref.id}`;

interface CacheEntry<T> {
  at: number;
  data: T;
  /** 만들 때 쓴 설정(prefsSignature). 설정이 바뀌면 "만들기"는 새로 만든다. */
  sig?: string;
}

const PREFIX = "studed-study:";

function readCache<T>(key: string, ttlMs: number, sig?: string, anySig = false): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (typeof entry.at !== "number" || Date.now() - entry.at > ttlMs) return null;
    if (!anySig && sig !== undefined && entry.sig !== sig) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, data: T, sig?: string) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data, sig } satisfies CacheEntry<T>));
  } catch {
    // 저장소가 가득 찼거나 막힌 환경 — 캐시 없이 동작한다.
  }
}

/**
 * 학습 도구(요약·카드·퀴즈·시험)가 서버에서 만들어 온 결과를 불러오는 훅. 같은 과제의 같은 도구는 브라우저에 저장해 두고
 * (결과물은 바뀌지 않으므로) 다시 열 때 AI를 또 부르지 않는다. "다시 만들기"는 refresh()로.
 * sig는 만들 때 쓴 AI 설정 — 설정이 바뀌었으면 저장된 자료 대신 새로 만든다. reuse(= "내 학습"에서 열기)면 설정과 상관없이 저장된 자료를 연다.
 */
export function useStudyData<T>(
  ref: StudyRef,
  tool: string,
  body: Record<string, unknown> = {},
  ttlMs = Infinity,
  opts: { sig?: string; reuse?: boolean } = {}
) {
  const { sig, reuse = false } = opts;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState<number | null>(null);
  const bodyRef = useRef(body);
  // 화면 언어가 바뀌면 다른 언어로 만든 자료를 다시 쓰지 않도록 언어를 키에 넣는다(서버가 쿠키의 언어로 만든다).
  const { lang } = useLang();
  const cacheKey = `${baseOf(ref)}:${tool}:${lang}`;
  // 예전 키(kind:id)로 저장된 것도 읽는다 — 키를 합치기 전에 만든 요약이 사라지지 않게.
  const legacyKey = `${ref.kind}:${ref.id}:${tool}:${lang}`;

  const load = useCallback(
    async (force: boolean) => {
      setError(null);
      if (!force) {
        const hit = readCache<T>(cacheKey, ttlMs, sig, reuse) ?? (legacyKey !== cacheKey ? readCache<T>(legacyKey, ttlMs, sig, reuse) : null);
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
        writeCache(cacheKey, json as T, sig);
      } catch (err) {
        setError(err instanceof Error ? err.message : "불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      } finally {
        setLoading(false);
      }
    },
    [cacheKey, legacyKey, ref, tool, ttlMs, sig, reuse]
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
  const heads = [`${PREFIX}${baseOf(ref)}:`, `${PREFIX}${ref.kind}:${ref.id}:`];
  const tail = `:${lang}`;
  const out: { tool: string; at: number }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const head = heads.find((h) => key?.startsWith(h));
      if (!key || !head || !key.endsWith(tail)) continue;
      const tool = key.slice(head.length, key.length - tail.length);
      const entry = JSON.parse(localStorage.getItem(key) ?? "null") as CacheEntry<unknown> | null;
      // 새 키와 예전 키에 같은 도구가 있으면 더 최근 것만 보여 준다.
      const dup = out.findIndex((o) => o.tool === tool);
      if (tool && typeof entry?.at === "number") {
        if (dup < 0) out.push({ tool, at: entry.at });
        else if (out[dup].at < entry.at) out[dup] = { tool, at: entry.at };
      }
    }
  } catch {
    // 저장소가 막힌 환경 — 목록 없이 동작한다.
  }
  return out;
}
