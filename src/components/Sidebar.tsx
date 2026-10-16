"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Clock, LayoutGrid, Menu, PanelLeftClose, PanelLeftOpen, Plus, ShieldCheck, X } from "lucide-react";
import AuthBar from "./AuthBar";
import { Logo } from "./Logo";
import { useAdminStatus } from "@/lib/admin/use-admin-status";
import { openNewCreation } from "@/lib/ui/new-creation";
import SidebarWorklist from "./SidebarWorklist";
import SidebarQuickActions from "./SidebarQuickActions";
import SettingsModal from "./settings/SettingsModal";

const NAV = [
  { href: "/", label: "내 창작물 관리", icon: LayoutGrid },
  { href: "/histories", label: "히스토리", icon: Clock },
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { isAdmin } = useAdminStatus();

  const linkClass = (active: boolean) =>
    [
      "flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-semibold transition-colors",
      collapsed ? "md:justify-center md:px-0" : "",
      active ? "bg-raised text-foreground" : "text-muted hover:bg-raised hover:text-foreground",
    ].join(" ");

  function startNew() {
    setOpen(false);
    openNewCreation((href) => router.push(href), pathname === "/");
  }

  return (
    <>
      {/* 모바일: 상단 바 + 메뉴 버튼 */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
        <Link href="/" aria-label="studed 홈">
          <Logo variant="wordmark" height={20} />
        </Link>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={open}
          className="grid h-9 w-9 place-items-center rounded-lg border border-border-strong"
        >
          {open ? <X size={18} strokeWidth={1.7} /> : <Menu size={18} strokeWidth={1.7} />}
        </button>
      </div>

      <aside
        className={[
          "shrink-0 flex-col border-r border-border bg-background",
          "md:sticky md:top-0 md:h-screen",
          collapsed ? "md:w-[68px]" : "md:w-[256px]",
          open ? "flex" : "hidden md:flex",
        ].join(" ")}
      >
        <div className={["hidden h-16 items-center px-4 md:flex", collapsed ? "md:justify-center" : "justify-between"].join(" ")}>
          {!collapsed && (
            <Link href="/" aria-label="studed 홈" onClick={() => setOpen(false)}>
              <Logo variant="wordmark" height={22} />
            </Link>
          )}
          <button
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
            className="hidden h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-foreground md:grid"
          >
            {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.7} /> : <PanelLeftClose size={18} strokeWidth={1.7} />}
          </button>
        </div>

        <div className="px-3 pt-3 md:pt-0">
          <button
            onClick={startNew}
            title="새 창작물"
            className={[
              "flex h-11 w-full items-center gap-2.5 rounded-xl bg-accent px-3.5 text-[14px] font-bold text-accent-foreground transition-opacity hover:opacity-90",
              collapsed ? "md:justify-center md:px-0" : "",
            ].join(" ")}
          >
            <Plus size={18} strokeWidth={2.2} className="shrink-0" />
            {!collapsed && <span>새 창작물</span>}
          </button>
        </div>

        <nav aria-label="주 메뉴" className="mt-3 space-y-0.5 px-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              title={label}
              className={linkClass(pathname === href || (href !== "/" && pathname.startsWith(href)))}
            >
              <Icon size={18} strokeWidth={1.7} className="shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              title="관리자 대시보드"
              className={linkClass(pathname.startsWith("/admin"))}
            >
              <ShieldCheck size={18} strokeWidth={1.7} className="shrink-0" />
              {!collapsed && <span>관리자 대시보드</span>}
            </Link>
          )}
        </nav>

        {!collapsed ? <SidebarWorklist onNavigate={() => setOpen(false)} /> : <div className="flex-1" />}

        <div className="border-t border-border p-3">
          <SidebarQuickActions collapsed={collapsed} onNavigate={() => setOpen(false)} />
          {!collapsed && <AuthBar />}
        </div>
      </aside>
      <SettingsModal />
    </>
  );
}
