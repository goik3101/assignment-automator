"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getBrowserSupabase } from "./browser-client";

// 로그인 상태는 화면 전체에서 하나만 구독한다. 예전엔 사이드바·계정 영역·홈 화면이 각자 getUser()(인증 서버 왕복)를 불러서
// 페이지를 열 때마다 같은 요청이 여러 번 나갔다. 여기서는 로컬 세션(getSession, 네트워크 없음)을 한 번 읽고 변경만 구독한다.
// 화면 표시용이다 — 서버는 요청마다 자체적으로 세션을 다시 확인한다.
interface AuthState {
  user: User | null;
  loading: boolean;
}

let state: AuthState = { user: null, loading: true };
let started = false;
const listeners = new Set<() => void>();

function publish(next: AuthState) {
  state = next;
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  const supabase = getBrowserSupabase();
  supabase.auth
    .getSession()
    .then(({ data }) => publish({ user: data.session?.user ?? null, loading: false }))
    .catch(() => publish({ user: null, loading: false }));
  supabase.auth.onAuthStateChange((_event, session) => publish({ user: session?.user ?? null, loading: false }));
}

/** 로그인 상태를 구독하는 훅. 여러 컴포넌트에서 각자 불러도 요청은 한 번만 나간다. */
export function useAuth() {
  const [snapshot, setSnapshot] = useState<AuthState>(state);

  useEffect(() => {
    const listener = () => setSnapshot(state);
    listeners.add(listener);
    start();
    listener(); // 구독 전에 이미 값이 정해졌을 수 있다
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return snapshot;
}
