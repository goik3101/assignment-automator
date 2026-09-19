"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/supabase/use-auth";
import type { AdministrativeInfo } from "@/types/task";
import NewLearningModal from "./NewLearningModal";
import { learningApi, formatDue } from "./api";

interface SessionRow {
  id: string;
  title: string;
  subject: string;
  status: "active" | "completed";
  admin_info: AdministrativeInfo | null;
  updated_at: string;
  progress: { done: number; total: number };
}

type Filter = "all" | "active" | "completed";
const FILTER_LABEL: Record<Filter, string> = { all: "전체", active: "진행 중", completed: "완료" };

function SessionCard({ s, onDelete }: { s: SessionRow; onDelete: (id: string) => void }) {
  const [menu, setMenu] = useState(false);
  const pct = s.progress.total ? Math.round((s.progress.done / s.progress.total) * 100) : 0;
  // Figma 카드: 썸네일 블록 + 그 아래 굵은 제목 + 우측 ⋮ 메뉴(바깥 테두리 상자 없음).
  // 썸네일 자리에는 안내문 이미지를 저장하지 않으므로 과목·진행률을 보여준다.
  return (
    <div className="relative w-full">
      <Link href={`/learning/${s.id}`} className="group block">
        <div className="flex aspect-[3/4] flex-col justify-between border border-border bg-background p-4 transition-colors group-hover:border-foreground">
          <span className="w-fit rounded-full border border-foreground/60 px-3 py-0.5 text-xs font-bold">{s.subject}</span>
          <div>
            <p className="mb-2 text-xs text-muted">
              {s.progress.done}/{s.progress.total} 항목 완료
            </p>
            <div className="h-1 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
        <p className="mt-1.5 truncate pr-7 text-sm font-bold">{s.title}</p>
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
                if (window.confirm("이 학습 과제를 목록에서 삭제할까요?")) onDelete(s.id);
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

// Figma "학습 모드" 화면: 새 과제 카드(점선 +) + 과제 카드 격자 + "진행중인 과제" 바로가기.
// Figma에 없던 빈 상태·로딩·오류·로그인 안내·검색/분류를 추가했다.
export default function LearningList() {
  const { user, loading: authLoading } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    learningApi<{ sessions: SessionRow[] }>("/api/learning/sessions")
      .then((data) => {
        if (cancelled) return;
        setSessions(data.sessions);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "불러오지 못했어요.");
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleDelete(id: string) {
    try {
      await learningApi(`/api/learning/sessions/${id}`, { method: "DELETE" });
      setSessions((prev) => prev?.filter((s) => s.id !== id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제하지 못했어요.");
    }
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (sessions ?? []).filter(
      (s) =>
        (filter === "all" || s.status === filter) &&
        (!q || s.title.toLowerCase().includes(q) || s.subject.toLowerCase().includes(q))
    );
  }, [sessions, query, filter]);

  const inProgress = (sessions ?? []).filter((s) => s.status === "active");

  if (authLoading) return <div className="px-8 py-10 text-sm text-muted">불러오는 중...</div>;

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="mb-2 text-lg font-semibold">학습 모드</h1>
        <p className="text-sm text-muted">
          학습 모드는 작성 중인 내용을 자동으로 저장하고 이어서 할 수 있도록 로그인 후에 이용할 수 있어요.
          왼쪽 아래에서 로그인해주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 md:px-8">
      <header className="mb-8 flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2.5 text-[22px] font-bold tracking-tight">
          <svg viewBox="0 0 20 20" fill="none" className="h-6 w-6">
            <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M9 3.5v13M11.5 7h3M11.5 10h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          학습 모드
        </h1>
        <div className="flex items-center gap-3">
          {searchOpen && (
            <>
              <label className="sr-only" htmlFor="learning-search">
                학습 과제 검색
              </label>
              <input
                id="learning-search"
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
          <label className="sr-only" htmlFor="learning-filter">
            분류
          </label>
          <select
            id="learning-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="rounded-full border border-foreground bg-transparent px-4 py-1 text-xs font-bold"
          >
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
              <option key={f} value={f} className="bg-background text-foreground">
                {f === "all" ? "분류" : FILTER_LABEL[f]}
              </option>
            ))}
          </select>
        </div>
      </header>

      {error && (
        <p role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <button
          onClick={() => setModal(true)}
          className="flex aspect-[3/4] flex-col items-center justify-center gap-2 border border-dashed border-foreground/70 text-foreground transition-opacity hover:opacity-70"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-14 w-14">
            <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
          </svg>
          <span className="text-sm font-bold">새 학습 과제</span>
        </button>
        {visible.map((s) => (
          <SessionCard key={s.id} s={s} onDelete={handleDelete} />
        ))}
      </div>

      {sessions && sessions.length === 0 && (
        <p className="mt-8 text-sm text-muted">
          아직 학습 과제가 없어요. 수행평가 안내문을 올리면 작성할 항목을 나눠서 자료를 준비해 드려요.
        </p>
      )}
      {sessions && sessions.length > 0 && visible.length === 0 && (
        <p className="mt-8 text-sm text-muted">조건에 맞는 학습 과제가 없어요.</p>
      )}

      {inProgress.length > 0 && (
        <section className="mt-16" aria-labelledby="in-progress-title">
          <h2 id="in-progress-title" className="mb-6 text-xl font-bold">
            진행중인 과제
          </h2>
          <ul className="flex flex-wrap gap-x-8 gap-y-6">
            {inProgress.map((s) => (
              <li key={s.id} className="flex flex-col items-center gap-2">
                <span className="text-xl font-semibold">{formatDue(s.admin_info?.due_date) ?? "기한 미정"}</span>
                <Link
                  href={`/learning/${s.id}`}
                  className="max-w-60 truncate rounded-xl border-2 border-foreground px-7 py-1.5 text-xl font-semibold transition-opacity hover:opacity-70"
                >
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {modal && <NewLearningModal onClose={() => setModal(false)} />}
    </div>
  );
}
