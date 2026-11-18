"use client";

import { useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ChevronsUpDown, LogOut, Mail, Moon, Settings } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/browser-client";
import { useAuth } from "@/lib/supabase/use-auth";
import { useAdminStatus } from "@/lib/admin/use-admin-status";
import { openSettings } from "@/lib/settings/open";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n";

const THEME_KEY = "studed-theme";

/**
 * 사이드바 하단의 계정 칸. 로그인 상태면 이름 한 줄을 누르면 위로 메뉴가 열린다(설정 · 다크 모드 · 로그아웃).
 * 비로그인이면 "로그인" 버튼 하나이고, 누르면 이메일 입력 창이 열린다.
 */
export default function AuthBar() {
  const t = useT();
  const { user, loading } = useAuth();
  const { isAdmin, setIsAdmin } = useAdminStatus();
  const [loginOpen, setLoginOpen] = useState(false);
  const [dark, setDark] = useState(false);

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
    if (isAdmin) {
      await fetch("/api/admin/logout", { method: "POST" });
      setIsAdmin(false);
    }
    await getBrowserSupabase().auth.signOut();
  }

  if (loading) return null;

  // isAdmin을 user보다 먼저 확인한다 — 관리자 코드 로그인 시 예약 계정으로 실제 Supabase 세션도 함께
  // 발급되므로 user도 항상 채워져 있는데, 그 예약 계정의 실제 이메일 대신 "관리자"로 보여주는 게 맞다.
  if (isAdmin || user) {
    const name = isAdmin ? t("관리자") : (user?.email ?? "").split("@")[0] || t("사용자");
    return (
      <DropdownMenu onOpenChange={(open) => open && setDark(document.documentElement.getAttribute("data-theme") === "dark")}>
        <DropdownMenuTrigger className="flex h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors hover:bg-raised data-popup-open:bg-raised">
          {/* 사람 모양 자리표시 대신 이름의 첫 글자 */}
          <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foreground text-[12px] font-semibold uppercase text-background">
            {name.slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{name}</span>
          <ChevronsUpDown size={15} strokeWidth={1.7} className="shrink-0 text-faint" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-(--anchor-width)">
          <DropdownMenuItem onClick={() => openSettings(isAdmin ? "general" : "account")}>
            <Settings size={17} strokeWidth={1.7} />
            {t("설정")}
          </DropdownMenuItem>
          {/* 누른 뒤에도 메뉴를 열어 둬서 바뀐 모습을 바로 본다 */}
          <DropdownMenuItem closeOnClick={false} onClick={toggleTheme}>
            <Moon size={17} strokeWidth={1.7} />
            <span className="flex-1">{t("다크 모드")}</span>
            <span aria-hidden className={["relative h-5 w-9 shrink-0 rounded-full transition-colors", dark ? "bg-foreground" : "bg-border-strong"].join(" ")}>
              <span className={["absolute top-0.5 h-4 w-4 rounded-full bg-background transition-all", dark ? "left-[18px]" : "left-0.5"].join(" ")} />
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void handleLogout()}>
            <LogOut size={17} strokeWidth={1.7} />
            {t("로그아웃")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      <Button variant="primary" onClick={() => setLoginOpen(true)} className="h-10 w-full rounded-lg text-[13.5px]">
        {t("로그인")}
      </Button>
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
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("이메일 주소")}
            aria-label={t("이메일 주소")}
            className="h-11 text-[14px]"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button type="submit" variant="primary" size="lg" disabled={!email.includes("@") || sending} className="w-full">
            {sending ? t("보내는 중...") : t("로그인 링크 받기")}
          </Button>
          <p className="pt-1 text-[11px] leading-snug text-faint">
            <Link href="/terms" className="underline">이용약관</Link> · <Link href="/privacy" className="underline">개인정보처리방침</Link>
          </p>
        </form>
      )}
    </Modal>
  );
}
