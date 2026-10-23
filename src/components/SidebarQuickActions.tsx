"use client";

import Link from "next/link";
import { MessageSquareText, Moon, Settings, Sun, Trash2 } from "lucide-react";
import { openSettings } from "@/lib/settings/open";
import { useT } from "@/lib/i18n";
import LanguageToggle from "./LanguageToggle";

const STORAGE_KEY = "studed-theme";

// 사이드바 하단: 휴지통 / 피드백·문의 / 테마 변경 / 설정. 테마 전환은 ThemeToggle(설정 페이지)과 같은
// 저장 키·data-theme 속성을 쓰므로 어디서 바꿔도 동일하게 동작한다. 상태를 들고 있지 않고 클릭
// 시점의 data-theme를 읽어 뒤집기만 한다(아이콘은 CSS로 라이트/다크에 맞춰 바뀐다).
export default function SidebarQuickActions({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const t = useT();

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
    "flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium text-muted transition-colors hover:bg-raised hover:text-foreground",
    collapsed ? "md:justify-center md:px-0" : "",
  ].join(" ");
  const iconProps = { size: 16, strokeWidth: 1.7 } as const;

  return (
    <div className="mb-2 space-y-0.5">
      <Link href="/trash" onClick={onNavigate} className={item} title={t("휴지통")}>
        <Trash2 {...iconProps} className="shrink-0" />
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
        <MessageSquareText {...iconProps} className="shrink-0" />
        {!collapsed && t("피드백/문의")}
      </button>
      <button onClick={toggleTheme} className={item} title={t("테마 변경")}>
        <Sun {...iconProps} className="hidden shrink-0 dark:block" />
        <Moon {...iconProps} className="shrink-0 dark:hidden" />
        {!collapsed && t("테마 변경")}
      </button>
      {!collapsed && (
        <div className="px-1 pt-1.5 [&>div]:w-full [&_button]:flex-1">
          <LanguageToggle variant="compact" />
        </div>
      )}
      {collapsed && (
        <button onClick={() => openSettings("general")} className={item} title={t("설정")}>
          <Settings {...iconProps} className="shrink-0" />
        </button>
      )}
    </div>
  );
}
