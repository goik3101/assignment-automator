"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthBar from "./AuthBar";
import { Logo } from "./Logo";
import { useAdminStatus } from "@/lib/admin/use-admin-status";
import SidebarWorklist from "./SidebarWorklist";
import SidebarQuickActions from "./SidebarQuickActions";

const NAV_ITEMS = [
  {
    href: "/",
    label: "새 수행평가",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
        <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/learning",
    label: "학습 모드",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
        <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 3.5v13" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    href: "/histories",
    label: "히스토리",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
        <path
          d="M10 5v5l3 2M17 10a7 7 0 1 1-2-4.9"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { isAdmin } = useAdminStatus();

  return (
    <>
      {/* 모바일: 상단 바 + 햄버거 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
        <Link href="/" aria-label="studed">
          <Logo variant="wordmark" height={20} />
        </Link>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="메뉴 열기"
          className="rounded-md border border-border p-1.5"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <aside
        className={[
          "shrink-0 border-r border-border flex flex-col",
          "md:h-screen md:sticky md:top-0",
          collapsed ? "md:w-14" : "md:w-56",
          open ? "block" : "hidden md:flex",
        ].join(" ")}
      >
        <div className="flex items-center justify-between px-4 py-4">
          {!collapsed && (
            <Link href="/" aria-label="studed">
              <Logo variant="wordmark" height={22} />
            </Link>
          )}
          <button
            onClick={() => setCollapsed((v) => !v)}
            aria-label="사이드바 접기/펼치기"
            className="hidden md:block rounded-md p-1 text-muted hover:text-foreground"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
              <path
                d={collapsed ? "M7 4l6 6-6 6" : "M13 4l-6 6 6 6"}
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-2">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/learning" ? pathname.startsWith("/learning") : pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                title={item.label}
                className={[
                  "flex items-center gap-3 rounded-md px-3 py-2 text-[17px] font-bold transition-colors",
                  active ? "bg-accent/15 text-foreground" : "text-foreground/90 hover:bg-accent/10",
                ].join(" ")}
              >
                <span className="shrink-0">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              title="관리자 대시보드"
              className={[
                "flex items-center gap-3 rounded-md px-3 py-2 text-[17px] font-bold transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-accent/15 text-foreground"
                  : "text-foreground/90 hover:bg-accent/10",
              ].join(" ")}
            >
              <span className="shrink-0">
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
                  <path
                    d="M10 3 4 5.5v4c0 4 2.6 6.9 6 8 3.4-1.1 6-4 6-8v-4L10 3Z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              {!collapsed && <span>관리자 대시보드</span>}
            </Link>
          )}
        </nav>

        {!collapsed && <SidebarWorklist onNavigate={() => setOpen(false)} />}
        <div className="flex-1" />

        <div className="border-t border-border p-3">
          {!collapsed && (
            <>
              <SidebarQuickActions onNavigate={() => setOpen(false)} />
              <AuthBar />
            </>
          )}
        </div>
      </aside>
    </>
  );
}
