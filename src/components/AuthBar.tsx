"use client";

import { useState } from "react";
import { LogOut, Mail, Settings, UserRound } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser-client";
import { useAuth } from "@/lib/supabase/use-auth";
import { useAdminStatus } from "@/lib/admin/use-admin-status";
import { openSettings } from "@/lib/settings/open";
import { useT } from "@/lib/i18n";

/** 사이드바 하단의 계정 영역. 로그인 상태면 이름 + 설정 + 로그아웃, 아니면 이메일 로그인 폼. */
export default function AuthBar() {
  const t = useT();
  const { user, loading } = useAuth();
  const { isAdmin, setIsAdmin } = useAdminStatus();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleAdminLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    // 로그인 때 함께 발급된 예약 계정 Supabase 세션도 같이 끊는다.
    await getBrowserSupabase().auth.signOut();
    setIsAdmin(false);
  }

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
      setError(t("전송에 실패했어요. 이메일 주소를 확인해 주세요."));
      return;
    }
    setSent(true);
  }

  async function handleLogout() {
    await getBrowserSupabase().auth.signOut();
  }

  if (loading) return null;

  // isAdmin을 user보다 먼저 확인한다 — 관리자 코드 로그인 시 예약 계정으로 실제 Supabase 세션도 함께
  // 발급되므로 user도 항상 채워져 있는데, 그 예약 계정의 실제 이메일 대신 "관리자"로 보여주는 게 맞다.
  if (isAdmin || user) {
    const name = isAdmin ? t("관리자") : (user?.email ?? "").split("@")[0] || t("사용자");
    return (
      <div className="flex items-center gap-2.5 rounded-xl px-1.5 py-1">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border-strong bg-raised text-muted">
          <UserRound size={16} strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{name}</p>
          {!isAdmin && <p className="truncate text-[11px] text-faint">{user?.email}</p>}
        </div>
        <button
          onClick={() => openSettings("account")}
          aria-label={t("설정")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-foreground"
        >
          <Settings size={16} strokeWidth={1.7} />
        </button>
        <button
          onClick={isAdmin ? handleAdminLogout : handleLogout}
          aria-label={t("로그아웃")}
          title={t("로그아웃")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-foreground"
        >
          <LogOut size={16} strokeWidth={1.7} />
        </button>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-surface p-3">
        <Mail size={16} strokeWidth={1.7} className="mt-0.5 shrink-0 text-muted" />
        <p className="text-xs leading-relaxed text-muted">{t("{email}로 로그인 링크를 보냈어요. 메일함을 확인해 주세요.", { email })}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
      <p className="text-xs font-semibold">{t("로그인하면 작업이 저장돼요")}</p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("이메일 주소")}
        aria-label={t("이메일 주소")}
        className="h-9 w-full rounded-lg border border-border-strong bg-background px-3 text-[13px] placeholder:text-faint"
      />
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        onClick={handleSendLink}
        disabled={!email.includes("@") || sending}
        className="h-9 w-full rounded-lg bg-accent text-[13px] font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {sending ? t("보내는 중...") : t("로그인 링크 받기")}
      </button>
    </div>
  );
}
