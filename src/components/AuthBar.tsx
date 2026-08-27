"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser-client";
import { useAuth } from "@/lib/supabase/use-auth";

/** 사이드바 하단에 들어가는 로그인/로그아웃 위젯. 로그인/비로그인 상태를 카드
 * 형태로 구분해서 보여준다. 계정 아이콘은 아이콘 세트를 받으면 앞에 붙일 것 —
 * 그 전까지는 텍스트+상태 점만 사용. */
export default function AuthBar() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSendLink() {
    setError(null);
    setSending(true);
    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSending(false);
    if (error) {
      setError("전송 실패. 이메일을 확인해주세요.");
      return;
    }
    setSent(true);
  }

  async function handleLogout() {
    const supabase = getBrowserSupabase();
    await supabase.auth.signOut();
  }

  if (loading) return null;

  if (user) {
    return (
      <div className="rounded-md border border-accent/30 bg-accent/5 p-2.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          <p className="truncate text-xs text-foreground">{user.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="mt-1.5 text-xs text-muted underline underline-offset-2 hover:text-foreground"
        >
          로그아웃
        </button>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="rounded-md border border-border bg-background p-2.5">
        <p className="text-xs text-muted">{email}로 링크를 보냈어요. 메일함을 확인해주세요.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-background p-2.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-muted" aria-hidden />
        <p className="text-xs text-muted">로그인 전</p>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="이메일로 로그인"
        className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs"
      />
      <button
        onClick={handleSendLink}
        disabled={!email.includes("@") || sending}
        className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs font-medium disabled:opacity-40"
      >
        {sending ? "전송 중..." : "로그인 링크 받기"}
      </button>
    </div>
  );
}
