"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Ellipsis, FileText, ImagePlus, Plus, Search, Settings, Sparkles, Trash2, Type, Wrench } from "lucide-react";
import { openSettings } from "@/lib/settings/open";
import { useAuth } from "@/lib/supabase/use-auth";
import HomeChat from "@/components/chat/HomeChat";

interface HistoryRow {
  id: string;
  title: string | null;
  subject: string;
  output_type: "essay" | "plan";
  created_at: string;
  preview: string;
}
interface SessionRow {
  id: string;
  title: string;
  subject: string;
  updated_at: string;
  progress: { done: number; total: number };
}

type CardItem =
  | { kind: "auto"; id: string; href: string; title: string; subject: string; at: string; preview: string; output: "essay" | "plan" }
  | { kind: "learning"; id: string; href: string; title: string; subject: string; at: string; done: number; total: number };

type Filter = "all" | "auto" | "learning";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "auto", label: "AI 모드" },
  { id: "learning", label: "학습 모드" },
];

const STARTERS = [
  { icon: BookOpen, label: "독서 감상문", topic: "책 한 권을 읽고 느낀 점을 정리하는 독서 감상문" },
  { icon: FileText, label: "과학 탐구 보고서", topic: "실험을 설계하고 결과를 분석하는 과학 탐구 보고서" },
  { icon: Type, label: "영어 발표", topic: "관심 주제로 3분 동안 발표하는 영어 스피치 대본" },
  { icon: Wrench, label: "진로 발표 PPT", topic: "희망 직업을 탐색하고 발표하는 진로 발표 PPT" },
];

export interface NewPrefill {
  topic?: string;
  image?: File | null;
  /** 모달을 어느 입력 방식으로 열지(사진 업로드 / 텍스트로 붙여넣기). */
  kind?: "image" | "text";
}

/** 점선 + 카드. 누르면 바로 아래에 "이미지 업로드 / 텍스트 업로드" 메뉴가 열린다. */
function NewCard({ onNew }: { onNew: (prefill?: NewPrefill) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="새 창작물 만들기"
        aria-expanded={open}
        aria-haspopup="menu"
        className="group/new flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border-strong text-muted transition-colors hover:bg-surface hover:text-foreground"
      >
        <span className="grid h-11 w-11 place-items-center rounded-full border border-current transition-transform group-hover/new:scale-105">
          <Plus size={20} strokeWidth={1.6} />
        </span>
        <span className="text-[13px] font-semibold">새 창작물</span>
      </button>
      {open && (
        <ul role="menu" className="absolute left-0 top-full z-10 mt-2 w-full min-w-[150px] rounded-xl border border-border-strong bg-surface p-1 shadow-xl">
          {([["image", "이미지 업로드", ImagePlus], ["text", "텍스트 업로드", Type]] as const).map(([kind, label, Icon]) => (
            <li key={kind}>
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onNew({ kind });
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition-colors hover:bg-raised"
              >
                <Icon size={15} strokeWidth={1.7} className="text-muted" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const dateFmt = new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" });

function Card({ c, onDelete }: { c: CardItem; onDelete: (c: CardItem) => void }) {
  const [menu, setMenu] = useState(false);
  const pct = c.kind === "learning" && c.total ? Math.round((c.done / c.total) * 100) : 0;
  return (
    <div className="group/card relative">
      <Link href={c.href} className="block">
        {/* 종이 한 장 같은 카드: 위쪽엔 과목·모드, 가운데는 내용 미리보기, 아래는 날짜(또는 진행률) */}
        <div className="flex aspect-[3/4] flex-col rounded-3xl bg-surface p-5 transition-all duration-200 group-hover/card:-translate-y-0.5 group-hover/card:bg-raised">
          <div className="flex items-center justify-between gap-2">
            <span className="max-w-[70%] truncate rounded-full bg-background px-2.5 py-0.5 text-[11px] font-semibold text-muted">
              {c.subject}
            </span>
            {c.kind === "learning" ? (
              <BookOpen size={14} strokeWidth={1.7} className="shrink-0 text-faint" aria-label="학습 모드" />
            ) : (
              <Sparkles size={14} strokeWidth={1.7} className="shrink-0 text-faint" aria-label="AI 모드" />
            )}
          </div>
          {c.kind === "auto" ? (
            <p className="mt-3 flex-1 overflow-hidden whitespace-pre-line break-words text-[11px] leading-[1.65] text-muted [mask-image:linear-gradient(to_bottom,black_65%,transparent)]">
              {c.preview || "내용이 없어요."}
            </p>
          ) : (
            <div className="mt-3 flex flex-1 flex-col justify-end">
              <p className="text-2xl font-bold tabular-nums">
                {c.done}
                <span className="text-base font-medium text-faint"> / {c.total}</span>
              </p>
              <p className="mt-0.5 text-[11px] text-muted">항목 작성 완료</p>
            </div>
          )}
          {c.kind === "learning" ? (
            <div
              className="mt-3 h-1 overflow-hidden rounded-full bg-raised"
              role="progressbar"
              aria-label="진행률"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-faint">{c.output === "essay" ? "완성 원고" : "실행 계획"}</p>
          )}
        </div>
        <div className="mt-2.5 flex items-baseline justify-between gap-2 pr-7">
          <p className="truncate text-[14px] font-semibold">{c.title}</p>
          <p className="shrink-0 text-[11px] text-faint">{dateFmt.format(new Date(c.at))}</p>
        </div>
      </Link>
      <div className="absolute bottom-0 right-0">
        <button
          onClick={() => setMenu((v) => !v)}
          aria-label="더보기"
          aria-expanded={menu}
          className="grid h-7 w-7 place-items-center rounded-md text-faint transition-colors hover:bg-raised hover:text-foreground"
        >
          <Ellipsis size={16} strokeWidth={1.8} />
        </button>
        {menu && (
          <div className="absolute bottom-9 right-0 z-10 w-36 rounded-xl border border-border-strong bg-surface p-1 shadow-xl">
            <button
              onClick={() => {
                setMenu(false);
                if (window.confirm("휴지통으로 옮길까요? 휴지통에서 되돌릴 수 있어요.")) onDelete(c);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-danger transition-colors hover:bg-raised"
            >
              <Trash2 size={14} strokeWidth={1.7} />
              휴지통으로
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 홈: "수행평가 및 과제". 새 창작물 카드 + 지금까지 만든 결과물(AI 모드)·학습 과제(학습 모드)를 한 격자에 모아서 보여주고,
 * 아래 고정된 입력창(HomeChat)으로 새 안내문이나 기존 과제를 바로 질문한다. 비로그인이면 새 창작물 카드만 보인다.
 */
export default function HomeDashboard({ onNew }: { onNew: (prefill?: NewPrefill) => void }) {
  const { user } = useAuth();
  const [histories, setHistories] = useState<HistoryRow[] | null>(null);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    // 두 목록을 따로 불러온다 — 한쪽(예: 학습 모드 테이블 미적용)이 실패해도 다른 쪽은 보여준다.
    const load = (url: string) => fetch(url).then((res) => (res.ok ? res.json() : null)).catch(() => null);
    Promise.all([load("/api/histories"), load("/api/learning/sessions")]).then(([h, l]) => {
      if (cancelled) return;
      if (!h && !l) setError("목록을 불러오지 못했어요. 새로고침해 주세요.");
      setHistories((h?.histories as HistoryRow[]) ?? []);
      setSessions((l?.sessions as SessionRow[]) ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const cards = useMemo<CardItem[]>(() => {
    const auto: CardItem[] = (histories ?? []).map((h) => ({
      kind: "auto",
      id: h.id,
      href: `/histories/${h.id}`,
      title: h.title || h.subject,
      subject: h.subject,
      at: h.created_at,
      preview: h.preview,
      output: h.output_type,
    }));
    const learn: CardItem[] = (sessions ?? []).map((s) => ({
      kind: "learning",
      id: s.id,
      href: `/learning/${s.id}`,
      title: s.title,
      subject: s.subject,
      at: s.updated_at,
      done: s.progress?.done ?? 0,
      total: s.progress?.total ?? 0,
    }));
    return [...auto, ...learn].sort((a, b) => b.at.localeCompare(a.at));
  }, [histories, sessions]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter(
      (c) => (filter === "all" || c.kind === filter) && (!q || c.title.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q))
    );
  }, [cards, query, filter]);

  async function handleDelete(c: CardItem) {
    try {
      const url = c.kind === "auto" ? `/api/histories/${c.id}` : `/api/learning/sessions/${c.id}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "삭제하지 못했어요.");
      if (c.kind === "auto") setHistories((prev) => prev?.filter((r) => r.id !== c.id) ?? null);
      else setSessions((prev) => prev?.filter((r) => r.id !== c.id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제하지 못했어요.");
    }
  }

  const loaded = !user || (histories !== null && sessions !== null);
  const empty = loaded && cards.length === 0;

  return (
    <div className="relative flex min-h-[calc(100vh-49px)] flex-col">
      <div className="flex-1 px-6 pb-16 pt-8 md:px-10">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">수행평가 및 과제</h1>
          <div className="flex items-center gap-2">
            {user && cards.length > 0 && (
              <div role="tablist" aria-label="보기 분류" className="flex gap-0.5 rounded-xl bg-raised p-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    role="tab"
                    aria-selected={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={[
                      "h-8 rounded-lg px-3 text-[13px] font-semibold transition-colors",
                      filter === f.id ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
                    ].join(" ")}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
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
                  placeholder="제목이나 과목으로 검색"
                  className="h-9 w-48 rounded-xl border border-border-strong bg-background px-3.5 text-[13px] placeholder:text-faint"
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
              className="grid h-9 w-9 place-items-center rounded-xl text-muted transition-colors hover:bg-raised hover:text-foreground"
            >
              <Search size={18} strokeWidth={1.7} />
            </button>
            <button
              onClick={() => openSettings()}
              aria-label="설정"
              className="grid h-9 w-9 place-items-center rounded-xl text-muted transition-colors hover:bg-raised hover:text-foreground"
            >
              <Settings size={18} strokeWidth={1.7} />
            </button>
          </div>
        </header>

        {/* 스크린샷 구조: 제목 아래에 업로드 버튼 두 개, 그 아래에 질문 입력창, 그다음에 카드 격자 */}
        <section aria-label="새 안내문 올리기와 질문" className="mb-12 flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => onNew({ kind: "image" })}
              className="inline-flex h-12 items-center gap-2.5 rounded-full bg-surface px-6 text-[15px] font-semibold transition-colors hover:bg-raised"
            >
              <ImagePlus size={18} strokeWidth={1.7} />
              사진 업로드
            </button>
            <button
              onClick={() => onNew({ kind: "text" })}
              className="inline-flex h-12 items-center gap-2.5 rounded-full bg-surface px-6 text-[15px] font-semibold transition-colors hover:bg-raised"
            >
              <Type size={18} strokeWidth={1.7} />
              텍스트로 붙여넣기
            </button>
          </div>
          <HomeChat />
        </section>

        {error && (
          <p role="alert" className="mb-5 rounded-xl border border-danger/50 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-x-5 gap-y-9">
          <NewCard onNew={onNew} />
          {visible.map((c) => (
            <Card key={`${c.kind}-${c.id}`} c={c} onDelete={handleDelete} />
          ))}
        </div>

        {user && cards.length > 0 && visible.length === 0 && (
          <p className="mt-10 text-sm text-muted">조건에 맞는 결과물이 없어요.</p>
        )}

        {(empty || !user) && (
          <section aria-label="시작하기" className="mt-12 max-w-2xl">
            <h2 className="text-base font-bold">
              {user ? "아직 만든 결과물이 없어요" : "수행평가 안내문을 올려 보세요"}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {user
                ? "사진이나 텍스트로 안내문을 올리면 요구사항을 정리해 주고, AI가 만들거나 직접 쓰는 방식을 고를 수 있어요."
                : "안내문 사진이나 주제만 있으면 돼요. 로그인하면 만든 결과물이 여기에 모여요."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {STARTERS.map(({ icon: Icon, label, topic }) => (
                <button
                  key={label}
                  onClick={() => onNew({ topic })}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-surface px-5 text-[13px] font-semibold transition-colors hover:bg-raised"
                >
                  <Icon size={15} strokeWidth={1.7} className="text-muted" />
                  {label}
                </button>
              ))}
              <button
                onClick={() => onNew()}
                className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
              >
                <ImagePlus size={15} strokeWidth={1.7} />
                사진으로 시작
              </button>
            </div>
          </section>
        )}
      </div>

    </div>
  );
}
