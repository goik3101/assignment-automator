"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Settings, UserRound } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser-client";
import { useAuth } from "@/lib/supabase/use-auth";
import { useAdminStatus } from "@/lib/admin/use-admin-status";
import { openSettings } from "@/lib/settings/open";
import { useT } from "@/lib/i18n";

/** 사이드바 하단의 계정 영역. 로그인 상태면 아바타 + 이름 + 설정(로그아웃은 설정 창), 아니면 이메일 로그인 폼. */
export default function AuthBar() {
  const t = useT();
  const { user, loading } = useAuth();
  const { isAdmin } = useAdminStatus();
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
      setError(t("전송에 실패했어요. 이메일 주소를 확인해 주세요."));
      return;
    }
    setSent(true);
  }

  if (loading) return null;

  // isAdmin을 user보다 먼저 확인한다 — 관리자 코드 로그인 시 예약 계정으로 실제 Supabase 세션도 함께
  // 발급되므로 user도 항상 채워져 있는데, 그 예약 계정의 실제 이메일 대신 "관리자"로 보여주는 게 맞다.
  if (isAdmin || user) {
    const name = isAdmin ? t("관리자") : (user?.email ?? "").split("@")[0] || t("사용자");
    return (
      <button
        onClick={() => openSettings(isAdmin ? "general" : "account")}
        title={t("설정")}
        className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-border-strong px-2.5 text-left transition-colors hover:bg-raised"
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-raised text-muted">
          <UserRound size={14} strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{name}</span>
        <Settings size={16} strokeWidth={1.7} className="shrink-0 text-muted" />
      </button>
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
      <p className="text-[11px] leading-snug text-faint">
        <Link href="/terms" className="underline">이용약관</Link> · <Link href="/privacy" className="underline">개인정보처리방침</Link>
      </p>
    </div>
  );
}
