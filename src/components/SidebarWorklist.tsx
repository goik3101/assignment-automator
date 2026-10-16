"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/supabase/use-auth";

interface WorkItem {
  key: string;
  href: string;
  title: string;
  mode: "learning" | "auto";
  at: string;
}

// 사이드바의 "작업 목록": 제목 + 모드 아이콘(학습 모드 = 책, AI 모드 = 반짝임). 학습 과제와 자동
// 작성 히스토리를 한 목록으로 보여준다(히스토리는 읽기 전용 조회). 목록이 비면 비워둔다.
export default function SidebarWorklist({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [items, setItems] = useState<WorkItem[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // 두 목록을 따로 불러온다 — 한쪽(예: 학습 모드 테이블 미적용)이 실패해도 다른 쪽은 보여준다.
    const load = (url: string) =>
      fetch(url)
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);
    Promise.all([load("/api/histories"), load("/api/learning/sessions")]).then(([h, l]) => {
      if (cancelled) return;
      const merged: WorkItem[] = [
        ...((l?.sessions ?? []) as { id: string; title: string; updated_at: string }[]).map((s) => ({
          key: `l-${s.id}`,
          href: `/learning/${s.id}`,
          title: s.title,
          mode: "learning" as const,
          at: s.updated_at,
        })),
        ...((h?.histories ?? []) as { id: string; title: string | null; subject: string; created_at: string }[]).map((x) => ({
          key: `h-${x.id}`,
          href: `/histories/${x.id}`,
          title: x.title || x.subject,
          mode: "auto" as const,
          at: x.created_at,
        })),
      ]
        .sort((x, y) => y.at.localeCompare(x.at))
        .slice(0, 8);
      setItems(merged);
    });
    return () => {
      cancelled = true;
    };
  }, [user, pathname]);

  if (!user || items.length === 0) return <div className="flex-1" />;

  return (
    <div className="mt-6 flex min-h-0 flex-1 flex-col px-3">
      <p className="mb-1.5 px-3 text-xs font-semibold text-faint">작업 목록</p>
      <ul className="min-h-0 space-y-0.5 overflow-y-auto">
        {items.map((it) => {
          const Icon = it.mode === "learning" ? BookOpen : Sparkles;
          return (
            <li key={it.key}>
              <Link
                href={it.href}
                onClick={onNavigate}
                title={it.title}
                aria-current={pathname === it.href ? "page" : undefined}
                className={[
                  "flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] transition-colors",
                  pathname === it.href ? "bg-raised text-foreground" : "text-muted hover:bg-raised hover:text-foreground",
                ].join(" ")}
              >
                <Icon size={14} strokeWidth={1.8} className="shrink-0" aria-label={it.mode === "learning" ? "학습 모드" : "AI 모드"} />
                <span className="truncate">{it.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
