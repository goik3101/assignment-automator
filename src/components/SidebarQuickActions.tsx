"use client";

import Link from "next/link";
import { Check, ExternalLink, Languages, MessageSquareText, MessagesSquare, Moon, Settings, Sun, Trash2 } from "lucide-react";
import { openSettings } from "@/lib/settings/open";
import { DISCORD_URL } from "@/lib/seo/site";
import { useLang } from "@/lib/i18n";
import { LANGS } from "@/lib/i18n/core";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const STORAGE_KEY = "studed-theme";

// 사이드바 하단 "도움말 및 도구": 휴지통 / 피드백·문의 / 커뮤니티 / 화면 언어. 모두 메뉴 글줄과 같은 모양이다.
// 테마 전환은 설정 창과 같은 저장 키·data-theme 속성을 쓰므로 어디서 바꿔도 동일하게 동작한다.
export default function SidebarQuickActions({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { lang, setLang, t } = useLang();

  function toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 저장소를 못 쓰는 환경에서는 이번 방문에만 적용된다.
    }
  }

  const item = [
    "flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium text-foreground transition-colors hover:bg-raised data-popup-open:bg-raised",
    collapsed ? "md:justify-center md:px-0" : "",
  ].join(" ");
  const iconProps = { size: 17, strokeWidth: 1.7 } as const;

  return (
    <div className="mb-2 space-y-0.5">
      {!collapsed && <p className="px-3 pb-1 text-xs font-medium text-faint">{t("도움말 및 도구")}</p>}
      <Link href="/trash" onClick={onNavigate} className={item} title={t("휴지통")}>
        <Trash2 {...iconProps} className="shrink-0 text-muted" />
        {!collapsed && t("휴지통")}
      </Link>
      <button
        onClick={() => {
          onNavigate?.();
          openSettings("feedback");
        }}
        className={item}
        title={t("피드백/문의")}
      >
        <MessageSquareText {...iconProps} className="shrink-0 text-muted" />
        {!collapsed && t("피드백/문의")}
      </button>
      <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className={item} title={t("Discord 서버")}>
        <MessagesSquare {...iconProps} className="shrink-0 text-muted" />
        {!collapsed && (
          <>
            <span className="flex-1">{t("Discord 서버")}</span>
            <ExternalLink size={13} strokeWidth={1.7} className="shrink-0 text-faint" aria-hidden />
          </>
        )}
      </a>
      {/* 펼친 사이드바에서는 계정 메뉴(AuthBar)의 "다크 모드" 스위치로 바꾼다 — 계정 칸이 없는 접힌 상태에서만 여기 둔다 */}
      {collapsed && (
        <button onClick={toggleTheme} className={item} title={t("테마 변경")}>
          <Sun {...iconProps} className="hidden shrink-0 text-muted dark:block" />
          <Moon {...iconProps} className="shrink-0 text-muted dark:hidden" />
        </button>
      )}
      {/* 누를 때마다 언어가 바뀌는 숨은 동작 대신, 고를 수 있는 목록으로 연다 */}
      <DropdownMenu>
        <DropdownMenuTrigger className={item} title={t("화면 언어")}>
          <Languages {...iconProps} className="shrink-0 text-muted" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{t("화면 언어")}</span>
              <span className="text-xs font-normal text-faint">{LANGS.find((l) => l.id === lang)?.label}</span>
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="min-w-44">
          {LANGS.map((l) => (
            <DropdownMenuItem key={l.id} onClick={() => setLang(l.id)}>
              <span className="flex-1">{l.label}</span>
              {l.id === lang && <Check size={14} strokeWidth={2} className="text-foreground!" aria-hidden />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {collapsed && (
        <button onClick={() => openSettings("general")} className={item} title={t("설정")}>
          <Settings {...iconProps} className="shrink-0 text-muted" />
        </button>
      )}
    </div>
  );
}
