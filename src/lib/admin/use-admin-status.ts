"use client";

import { useEffect, useState } from "react";

/** 관리자 코드 로그인 여부를 구독하는 훅 — 관리자 세션은 httpOnly 커스텀
 * 쿠키라 useAuth()(Supabase)로는 안 잡혀서 별도로 서버에 확인한다.
 * AuthBar(사이드바 하단 표시)와 Sidebar(관리자 대시보드 링크)가 같은
 * 상태를 각자 fetch하면 중복 요청이라 여기서 공유한다. */
export function useAdminStatus() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/session")
      .then((res) => res.json())
      .then((data) => setIsAdmin(!!data.isAdmin))
      .catch(() => setIsAdmin(false))
      .finally(() => setLoading(false));
  }, []);

  return { isAdmin, loading, setIsAdmin };
}
