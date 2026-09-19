"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/supabase/use-auth";
import OnboardingChecklist from "./OnboardingChecklist";

interface HistoryRow {
  id: string;
  title: string | null;
  subject: string;
  output_type: "essay" | "plan";
  created_at: string;
}

type Filter = "all" | "essay" | "plan";
const FILTER_LABEL: Record<Filter, string> = { all: "분류", essay: "완성 원고", plan: "실행 계획" };
const TYPE_LABEL = { essay: "완성 원고", plan: "실행 계획" } as const;

function HistoryCard({ h, onDelete }: { h: HistoryRow; onDelete: (id: string) => void }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="relative w-full">
      <Link href={`/histories/${h.id}`} className="group block">
        <div className="flex aspect-[3/4] flex-col justify-between border border-border bg-background p-4 transition-colors group-hover:border-foreground">
          <span className="w-fit rounded-full border border-foreground/60 px-3 py-0.5 text-xs font-bold">{h.subject}</span>
          <div>
            <p className="text-xs text-muted">{TYPE_LABEL[h.output_type]}</p>
            <p className="mt-0.5 text-xs text-muted">{new Date(h.created_at).toLocaleDateString("ko-KR")}</p>
          </div>
        </div>
        <p className="mt-1.5 truncate pr-7 text-sm font-bold">{h.title || h.subject}</p>
      </Link>
      <div className="absolute bottom-0 right-0">
        <button
          onClick={() => setMenu((v) => !v)}
          aria-label="더보기"
          aria-expanded={menu}
          className="rounded-md p-1 text-foreground/80 hover:text-foreground"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <circle cx="10" cy="4" r="1.3" />
            <circle cx="10" cy="10" r="1.3" />
            <circle cx="10" cy="16" r="1.3" />
          </svg>
        </button>
        {menu && (
          <div className="absolute bottom-8 right-0 z-10 w-28 rounded-xl border border-border bg-surface p-1 shadow-lg">
            <button
              onClick={() => {
                setMenu(false);
                if (window.confirm("정말 삭제하시겠습니까? 삭제하면 되돌릴 수 없어요.")) onDelete(h.id);
              }}
              className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-red-500 hover:bg-background"
            >
              삭제
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Figma 홈 화면 "수행평가 및 과제": 점선 + 카드(누르면 새 수행평가 입력 모달) + 지금까지 만든
// 결과물 카드 격자. 비로그인이면 + 카드만 보인다(결과물은 로그인 사용자만 저장된다).
// 기존 히스토리 기능(상세 보기·삭제 API)을 그대로 쓰는 읽기 전용 화면이다.
export default function HomeDashboard({ onNew }: { onNew: () => void }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch("/api/histories")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("목록을 불러오지 못했어요."))))
      .then((data: { histories: HistoryRow[] }) => {
        if (!cancelled) setRows(data.histories);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "목록을 불러오지 못했어요.");
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/histories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "삭제에 실패했습니다.");
      setRows((prev) => prev?.filter((r) => r.id !== id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다.");
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (filter === "all" || r.output_type === filter) &&
        (!q || (r.title ?? "").toLowerCase().includes(q) || r.subject.toLowerCase().includes(q))
    );
  }, [rows, query, filter]);

  return (
    <div>
      <header className="mb-8 flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold tracking-tight">수행평가 및 과제</h1>
        <div className="flex items-center gap-3">
          {searchOpen && (
            <>
              <label className="sr-only" htmlFor="home-search">
                결과물 검색
              </label>
              <input
                id="home-search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="검색"
                className="w-40 rounded-full border border-foreground/60 bg-transparent px-4 py-1 text-sm"
              />
            </>
          )}
          <button
            onClick={() => {
              setSearchOpen((v) => !v);
              if (searchOpen) setQuery("");
            }}
            aria-label="검색"
            aria-pressed={searchOpen}
            className="text-foreground hover:opacity-70"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
              <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <Link href="/settings" aria-label="설정" className="text-foreground hover:opacity-70">
            <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]">
              <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10 3v1.6M10 15.4V17M17 10h-1.6M4.6 10H3M14.8 5.2l-1.1 1.1M6.3 13.7l-1.1 1.1M14.8 14.8l-1.1-1.1M6.3 6.3 5.2 5.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </Link>
          <label className="sr-only" htmlFor="home-filter">
            분류
          </label>
          <select
            id="home-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="rounded-full border border-foreground bg-transparent px-4 py-1 text-xs font-bold"
          >
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
              <option key={f} value={f} className="bg-background text-foreground">
                {FILTER_LABEL[f]}
              </option>
            ))}
          </select>
        </div>
      </header>

      {error && (
        <p role="alert" className="mb-5 rounded-xl border border-red-500/60 px-4 py-3 text-sm text-red-500">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <button
          onClick={onNew}
          aria-label="새 수행평가 만들기"
          className="flex aspect-[3/4] items-center justify-center border border-dashed border-foreground/70 text-foreground transition-opacity hover:opacity-70"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-14 w-14">
            <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
          </svg>
        </button>
        {visible.map((h) => (
          <HistoryCard key={h.id} h={h} onDelete={handleDelete} />
        ))}
      </div>

      {!user && (
        <p className="mt-8 text-sm text-muted">로그인하면 만든 결과물이 여기에 모여요. 로그인 없이는 1회만 만들 수 있어요.</p>
      )}
      {user && rows && rows.length === 0 && (
        <p className="mt-8 text-sm text-muted">아직 만든 결과물이 없어요. + 를 눌러 수행평가 안내문을 올려보세요.</p>
      )}
      {(!user || (rows && rows.length === 0)) && (
        <div className="mt-8 max-w-md">
          <OnboardingChecklist completed={[false, false, false]} />
        </div>
      )}
      {rows && rows.length > 0 && visible.length === 0 && <p className="mt-8 text-sm text-muted">조건에 맞는 결과물이 없어요.</p>}
    </div>
  );
}
