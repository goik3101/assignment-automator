"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/supabase/use-auth";

interface WorkItem {
  key: string;
  href: string;
  title: string;
  mode: "learning" | "auto";
  at: string;
}

// Figma 사이드바의 "작업 목록": 제목 / 모드 태그(학습모드📚, AI모드✨). 학습 과제와 자동
// 작성 히스토리를 한 목록으로 보여준다(히스토리는 읽기 전용 조회). 이 목록은 부가
// 기능이라 실패하면(예: 학습 모드 테이블 미적용) 아무것도 그리지 않고 조용히 숨긴다 —
// 기존 사이드바 동작에 영향을 주지 않기 위함.
export default function SidebarWorklist({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [items, setItems] = useState<WorkItem[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch("/api/learning/sessions?withHistories=1")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("worklist"))))
      .then(
        (data: {
          sessions: { id: string; title: string; updated_at: string }[];
          histories?: { id: string; title: string | null; subject: string; created_at: string }[];
        }) => {
          if (cancelled) return;
          const merged: WorkItem[] = [
            ...data.sessions.map((s) => ({
              key: `l-${s.id}`,
              href: `/learning/${s.id}`,
              title: s.title,
              mode: "learning" as const,
              at: s.updated_at,
            })),
            ...(data.histories ?? []).map((h) => ({
              key: `h-${h.id}`,
              href: `/histories/${h.id}`,
              title: h.title || h.subject,
              mode: "auto" as const,
              at: h.created_at,
            })),
          ]
            .sort((a, b) => b.at.localeCompare(a.at))
            .slice(0, 8);
          setItems(merged);
        }
      )
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user, pathname]);

  if (!user || items.length === 0) return null;

  return (
    <div className="mt-5 px-2">
      <p className="mb-1.5 px-2.5 text-xs font-bold">작업 목록</p>
      <ul className="space-y-0.5">
        {items.map((it) => (
          <li key={it.key}>
            <Link
              href={it.href}
              onClick={onNavigate}
              title={it.title}
              className={[
                "flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                pathname === it.href ? "bg-accent/15 text-foreground" : "text-foreground hover:bg-accent/10",
              ].join(" ")}
            >
              <span className="truncate">{it.title}</span>
              <span className="shrink-0 text-[10px]" aria-label={it.mode === "learning" ? "학습 모드" : "AI 모드"}>
                {it.mode === "learning" ? "학습모드📚" : "AI모드✨"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
