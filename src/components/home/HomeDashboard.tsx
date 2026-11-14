"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Ellipsis, FileText, ImagePlus, Plus, Search, Settings, Trash2, Type, Wrench } from "lucide-react";
import { openSettings } from "@/lib/settings/open";
import { useAuth } from "@/lib/supabase/use-auth";
import HomeChat from "@/components/chat/HomeChat";
import { useLang, useT } from "@/lib/i18n";

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
  { icon: BookOpen, cover: "독서", label: "독서 감상문", topic: "책 한 권을 읽고 느낀 점을 정리하는 독서 감상문" },
  { icon: FileText, cover: "과학", label: "과학 탐구 보고서", topic: "실험을 설계하고 결과를 분석하는 과학 탐구 보고서" },
  { icon: Type, cover: "영어", label: "영어 발표", topic: "관심 주제로 3분 동안 발표하는 영어 스피치 대본" },
  { icon: Wrench, cover: "진로", label: "진로 발표 PPT", topic: "희망 직업을 탐색하고 발표하는 진로 발표 PPT" },
];

export interface NewPrefill {
  topic?: string;
  image?: File | null;
  /** 모달을 어느 입력 방식으로 열지(사진 업로드 / 텍스트로 붙여넣기). */
  kind?: "image" | "text";
}

/** 점선 + 카드. 누르면 바로 아래에 "이미지 업로드 / 텍스트 업로드" 메뉴가 열린다. */
function NewCard({ onNew }: { onNew: (prefill?: NewPrefill) => void }) {
  const t = useT();
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
        aria-label={t("새 창작물 만들기")}
        aria-expanded={open}
        aria-haspopup="menu"
        className="group/new flex h-full min-h-[132px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong text-muted transition-colors hover:bg-surface hover:text-foreground"
      >
        <span className="grid h-11 w-11 place-items-center rounded-full border border-current transition-transform group-hover/new:scale-105">
          <Plus size={20} strokeWidth={1.6} />
        </span>
        <span className="text-[13px] font-semibold">{t("새 창작물")}</span>
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
                {t(label)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 아직 만든 결과물이 없을 때(비로그인 포함) 격자에 놓이는 시작 카드 — 결과물 카드와 같은 모양이고, 누르면 그 주제로 새 창작물 창이 열린다. */
function StarterCard({ starter, onNew }: { starter: (typeof STARTERS)[number]; onNew: (prefill?: NewPrefill) => void }) {
  const t = useT();
  const Icon = starter.icon;
  return (
    <button
      onClick={() => onNew({ topic: starter.topic })}
      className="block w-full overflow-hidden rounded-2xl bg-surface text-left transition-colors hover:bg-raised"
    >
      <div className="flex h-[84px] flex-col justify-between bg-raised/70 p-3">
        <Icon size={16} strokeWidth={1.7} className="text-muted" aria-hidden />
        <span className="truncate text-[20px] font-bold leading-none tracking-tight text-foreground/80">{t(starter.cover)}</span>
      </div>
      <div className="p-3">
        <p className="truncate text-[14px] font-semibold">{t(starter.label)}</p>
        <p className="mt-0.5 truncate text-[12px] text-muted">{t("눌러서 시작")}</p>
      </div>
    </button>
  );
}

const dateFmts = {
  ko: new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }),
  en: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }),
};

function Card({ c, onDelete }: { c: CardItem; onDelete: (c: CardItem) => void }) {
  const { lang, t } = useLang();
  const [menu, setMenu] = useState(false);
  const Icon = c.kind === "learning" ? BookOpen : FileText;
  const kindText = c.kind === "learning" ? `${c.done} / ${c.total}` : c.output === "essay" ? t("완성 원고") : t("실행 계획");
  return (
    <div className="group/card relative">
      <Link href={c.href} className="block overflow-hidden rounded-2xl bg-surface transition-colors group-hover/card:bg-raised">
        {/* 윗부분: 과목을 크게 — 결과물에 이미지가 없으니 "무슨 과목인가"가 가장 먼저 읽히는 표지가 된다 */}
        <div className="flex h-[84px] flex-col justify-between bg-raised/70 p-3">
          <Icon size={16} strokeWidth={1.7} className="text-muted" aria-hidden />
          <span className="truncate text-[20px] font-bold leading-none tracking-tight text-foreground/80">{c.subject}</span>
        </div>
        <div className="p-3">
          <p className="truncate text-[14px] font-semibold">{c.title}</p>
          <p className="mt-0.5 truncate text-[12px] text-muted">
            {kindText} · {c.subject} · {dateFmts[lang].format(new Date(c.at))}
          </p>
        </div>
      </Link>
      <div className="absolute right-2 top-2">
        <button
          onClick={() => setMenu((v) => !v)}
          aria-label={t("더보기")}
          aria-expanded={menu}
          className="grid h-7 w-7 place-items-center rounded-md text-muted opacity-0 transition-opacity hover:bg-background hover:text-foreground focus:opacity-100 group-hover/card:opacity-100"
        >
          <Ellipsis size={16} strokeWidth={1.8} />
        </button>
        {menu && (
          <div className="absolute right-0 top-9 z-10 w-36 rounded-xl border border-border-strong bg-surface p-1 shadow-xl">
            <button
              onClick={() => {
                setMenu(false);
                if (window.confirm(t("휴지통으로 옮길까요? 휴지통에서 되돌릴 수 있어요."))) onDelete(c);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-danger transition-colors hover:bg-raised"
            >
              <Trash2 size={14} strokeWidth={1.7} />
              {t("휴지통으로")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 홈: "과제". 새 창작물 카드 + 지금까지 만든 결과물(AI 모드)·학습 과제(학습 모드)를 한 격자에 모아서 보여주고,
 * 아래 고정된 입력창(HomeChat)으로 새 안내문이나 기존 과제를 바로 질문한다. 비로그인이면 새 창작물 카드만 보인다.
 */
export default function HomeDashboard({ onNew }: { onNew: (prefill?: NewPrefill) => void }) {
  const { user } = useAuth();
  const t = useT();
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
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? t("삭제하지 못했어요."));
      if (c.kind === "auto") setHistories((prev) => prev?.filter((r) => r.id !== c.id) ?? null);
      else setSessions((prev) => prev?.filter((r) => r.id !== c.id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("삭제하지 못했어요."));
    }
  }

  const displayName = user ? ((user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined) ?? user.email?.split("@")[0] ?? "") : "";
  const greeting = displayName ? t("{name}님, 무엇을 만들어 볼까요?", { name: displayName }) : t("무엇을 만들어 볼까요?");
  const loaded = !user || (histories !== null && sessions !== null);
  const empty = loaded && cards.length === 0;

  return (
    <div className="relative flex min-h-[calc(100vh-49px)] flex-col">
      <div className="flex-1 px-5 pb-16 pt-6 md:px-14">
        {/* 오른쪽 위: 검색·설정만 조용히 둔다(제목 대신 아래 인사말이 첫 화면의 중심) */}
        <div className="mb-2 flex items-center justify-end gap-1.5 md:mb-0">
          {searchOpen && (
            <>
              <label className="sr-only" htmlFor="home-search">
                {t("결과물 검색")}
              </label>
              <input
                id="home-search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("제목이나 과목으로 검색")}
                className="h-9 w-40 rounded-full bg-surface px-4 text-[13px] placeholder:text-faint sm:w-56"
              />
            </>
          )}
          <button
            onClick={() => {
              setSearchOpen((v) => !v);
              if (searchOpen) setQuery("");
            }}
            aria-label={t("검색")}
            aria-pressed={searchOpen}
            className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-raised hover:text-foreground"
          >
            <Search size={18} strokeWidth={1.7} />
          </button>
          <button
            onClick={() => openSettings()}
            aria-label={t("설정")}
            className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-raised hover:text-foreground"
          >
            <Settings size={18} strokeWidth={1.7} />
          </button>
        </div>

        {/* 가운데 정렬 첫 화면: 인사말 → 올리기 카드 두 장 → 질문 입력창 (그 아래에 내 결과물 격자) */}
        <section aria-label={t("새 안내문 올리기와 질문")} className="mx-auto mb-20 flex w-full max-w-[720px] flex-col items-center gap-8 pt-4 md:pt-16">
          <h1 className="text-center text-[26px] font-medium leading-tight tracking-tight md:text-[30px]">{greeting}</h1>
          <HomeChat onNew={onNew} />
        </section>

        {(empty || !user) && (
          <div className="mx-auto mb-7 w-full max-w-[1200px]">
            <h2 className="text-lg font-bold tracking-tight">{t("시작하기")}</h2>
          </div>
        )}

        {user && cards.length > 0 && (
          <div className="mx-auto mb-7 flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold tracking-tight">{t("내 창작물")}</h2>
            <div role="tablist" aria-label={t("보기 분류")} className="flex gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={[
                    "h-8 rounded-full px-3 text-[13px] font-medium transition-colors",
                    filter === f.id ? "bg-surface text-foreground" : "text-muted hover:text-foreground",
                  ].join(" ")}
                >
                  {t(f.label)}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mb-5 rounded-xl border border-danger/50 px-4 py-3 text-sm text-danger">
            {t(error)}
          </p>
        )}

        {/* 시작 화면(카드 5장)은 한 줄에 다 들어가도록 카드를 조금 좁힌다 */}
        <div
          className={[
            "mx-auto grid w-full max-w-[1200px] grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-4 gap-y-7 sm:gap-4",
            empty || !user ? "sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]" : "sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]",
          ].join(" ")}
        >
          <NewCard onNew={onNew} />
          {visible.map((c) => (
            <Card key={`${c.kind}-${c.id}`} c={c} onDelete={handleDelete} />
          ))}
          {(empty || !user) && STARTERS.map((st) => <StarterCard key={st.label} starter={st} onNew={onNew} />)}
        </div>

        {user && cards.length > 0 && visible.length === 0 && (
          <p className="mx-auto mt-10 w-full max-w-[1200px] text-sm text-muted">{t("조건에 맞는 결과물이 없어요.")}</p>
        )}

      </div>

    </div>
  );
}
