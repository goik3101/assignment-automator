"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ChevronsUpDown, LogIn, LogOut, Mail, Moon, Settings, UserRound } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser-client";
import { useAuth } from "@/lib/supabase/use-auth";
import { useAdminStatus } from "@/lib/admin/use-admin-status";
import { openSettings } from "@/lib/settings/open";
import Modal from "@/components/ui/Modal";
import { useT } from "@/lib/i18n";

const THEME_KEY = "studed-theme";

/**
 * 사이드바 하단의 계정 칸. 로그인 상태면 아바타·이름 한 칸을 누르면 위로 메뉴가 열린다(설정 · 다크 모드 · 로그아웃).
 * 비로그인이면 "로그인" 버튼 한 칸이고, 누르면 이메일 입력 창이 열린다. 칸 모양은 두 상태가 같다.
 */
export default function AuthBar() {
  const t = useT();
  const { user, loading } = useAuth();
  const { isAdmin, setIsAdmin } = useAdminStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 메뉴가 열려 있는 동안 바깥을 누르거나 Esc를 누르면 닫는다.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function toggleMenu() {
    if (!menuOpen) setDark(document.documentElement.getAttribute("data-theme") === "dark");
    setMenuOpen((v) => !v);
  }

  // 설정 창과 같은 저장 키·data-theme 속성을 쓰므로 어디서 바꿔도 동일하게 동작한다.
  function toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    setDark(next === "dark");
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // 저장소를 못 쓰는 환경에서는 이번 방문에만 적용된다.
    }
  }

  async function handleLogout() {
    setMenuOpen(false);
    if (isAdmin) {
      await fetch("/api/admin/logout", { method: "POST" });
      setIsAdmin(false);
    }
    await getBrowserSupabase().auth.signOut();
  }

  if (loading) return null;

  const trigger =
    "flex h-11 w-full items-center gap-2.5 rounded-xl border border-border-strong px-2.5 text-left transition-colors hover:bg-raised";

  // isAdmin을 user보다 먼저 확인한다 — 관리자 코드 로그인 시 예약 계정으로 실제 Supabase 세션도 함께
  // 발급되므로 user도 항상 채워져 있는데, 그 예약 계정의 실제 이메일 대신 "관리자"로 보여주는 게 맞다.
  if (isAdmin || user) {
    const name = isAdmin ? t("관리자") : (user?.email ?? "").split("@")[0] || t("사용자");
    const row = "flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[13.5px] font-medium transition-colors hover:bg-raised";
    return (
      <div ref={boxRef} className="relative">
        {menuOpen && (
          <div role="menu" className="absolute inset-x-0 bottom-full z-30 mb-2 rounded-xl border border-border-strong bg-surface p-1.5 shadow-xl">
            <button
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                openSettings(isAdmin ? "general" : "account");
              }}
              className={row}
            >
              <Settings size={17} strokeWidth={1.7} className="shrink-0 text-muted" />
              {t("설정")}
            </button>
            <button role="menuitemcheckbox" aria-checked={dark} onClick={toggleTheme} className={row}>
              <Moon size={17} strokeWidth={1.7} className="shrink-0 text-muted" />
              <span className="flex-1">{t("다크 모드")}</span>
              <span
                aria-hidden
                className={["relative h-5 w-9 shrink-0 rounded-full transition-colors", dark ? "bg-foreground" : "bg-border-strong"].join(" ")}
              >
                <span
                  className={["absolute top-0.5 h-4 w-4 rounded-full bg-background transition-all", dark ? "left-[18px]" : "left-0.5"].join(" ")}
                />
              </span>
            </button>
            <div className="my-1 h-px bg-border" />
            <button role="menuitem" onClick={handleLogout} className={row}>
              <LogOut size={17} strokeWidth={1.7} className="shrink-0 text-muted" />
              {t("로그아웃")}
            </button>
          </div>
        )}
        <button onClick={toggleMenu} aria-haspopup="menu" aria-expanded={menuOpen} className={trigger}>
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-raised text-muted">
            <UserRound size={14} strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{name}</span>
          <ChevronsUpDown size={16} strokeWidth={1.7} className="shrink-0 text-muted" />
        </button>
      </div>
    );
  }

  return (
    <>
      <button onClick={() => setLoginOpen(true)} className={trigger}>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-raised text-muted">
          <LogIn size={14} strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{t("로그인")}</span>
      </button>
      {/* 사이드바(aside)는 자기만의 쌓임 순서를 만들어 창이 본문 아래에 깔리므로, 창은 body 바로 아래에 그린다 */}
      {loginOpen && createPortal(<LoginModal onClose={() => setLoginOpen(false)} />, document.body)}
    </>
  );
}

/** 이메일로 로그인 링크를 받는 작은 창. */
function LoginModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function handleSendLink() {
    if (!email.includes("@") || sending) return;
    setError(null);
    setSending(true);
    const { error } = await getBrowserSupabase().auth.signInWithOtp({
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

  return (
    <Modal title={t("로그인")} onClose={onClose} width={400} busy={sending}>
      {sent ? (
        <div className="flex items-start gap-3 rounded-xl bg-surface p-4">
          <Mail size={18} strokeWidth={1.7} className="mt-0.5 shrink-0 text-muted" />
          <p className="text-sm leading-relaxed text-muted">{t("{email}로 로그인 링크를 보냈어요. 메일함을 확인해 주세요.", { email })}</p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSendLink();
          }}
          className="space-y-3"
        >
          <p className="text-sm text-muted">{t("로그인하면 작업이 저장돼요")}</p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("이메일 주소")}
            aria-label={t("이메일 주소")}
            className="h-11 w-full rounded-xl border border-border-strong bg-background px-4 text-[14px] placeholder:text-faint"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            type="submit"
            disabled={!email.includes("@") || sending}
            className="h-11 w-full rounded-xl bg-accent text-[14px] font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {sending ? t("보내는 중...") : t("로그인 링크 받기")}
          </button>
          <p className="pt-1 text-[11px] leading-snug text-faint">
            <Link href="/terms" className="underline">이용약관</Link> · <Link href="/privacy" className="underline">개인정보처리방침</Link>
          </p>
        </form>
      )}
    </Modal>
  );
}
