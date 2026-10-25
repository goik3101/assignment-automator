"use client";

import { useEffect, useState } from "react";

// 관리자 세션은 httpOnly 커스텀 쿠키라 useAuth()(Supabase)로는 안 잡혀서 별도로 서버에 확인한다.
// AuthBar(사이드바 하단 표시)와 Sidebar(관리자 대시보드 링크)가 같은 상태를 각자 fetch하면 중복 요청이라 한 번만 확인해 공유한다.
let status: boolean | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: boolean) {
  status = next;
  listeners.forEach((l) => l());
}

function load() {
  if (status !== null || inflight) return;
  inflight = fetch("/api/admin/session")
    .then((res) => res.json())
    .then((data) => publish(!!data.isAdmin))
    .catch(() => publish(false))
    .finally(() => {
      inflight = null;
    });
}

export function useAdminStatus() {
  const [snapshot, setSnapshot] = useState<boolean | null>(status);

  useEffect(() => {
    const listener = () => setSnapshot(status);
    listeners.add(listener);
    load();
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return { isAdmin: snapshot === true, loading: snapshot === null, setIsAdmin: publish };
}
