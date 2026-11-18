"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Ellipsis, FileText, ImagePlus, Plus, Search, Settings, Trash2, Type } from "lucide-react";
import { openSettings } from "@/lib/settings/open";
import { useAuth } from "@/lib/supabase/use-auth";
import HomeChat from "@/components/chat/HomeChat";
import { useLang, useT } from "@/lib/i18n";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

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
  { cover: "독서", label: "독서 감상문", hint: "책 한 권을 읽고 느낀 점 정리", topic: "책 한 권을 읽고 느낀 점을 정리하는 독서 감상문" },
  { cover: "과학", label: "과학 탐구 보고서", hint: "실험 설계부터 결과 분석까지", topic: "실험을 설계하고 결과를 분석하는 과학 탐구 보고서" },
  { cover: "영어", label: "영어 발표", hint: "3분 영어 스피치 대본", topic: "관심 주제로 3분 동안 발표하는 영어 스피치 대본" },
  { cover: "진로", label: "진로 발표 PPT", hint: "희망 직업 탐색과 발표 자료", topic: "희망 직업을 탐색하고 발표하는 진로 발표 PPT" },
];

// 결과물 카드와 시작 카드가 같이 쓰는 면: 위에 작은 분류, 아래에 제목. 색 띠·큰 아이콘 없이 선과 면만으로.
const CARD_FACE =
  "flex min-h-[148px] flex-col justify-between rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-raised/60";

export interface NewPrefill {
  topic?: string;
  image?: File | null;
  /** 모달을 어느 입력 방식으로 열지(사진 업로드 / 텍스트로 붙여넣기). */
  kind?: "image" | "text";
}

/** 점선 + 카드. 누르면 바로 아래에 "이미지 업로드 / 텍스트 업로드" 메뉴가 열린다. */
function NewCard({ onNew }: { onNew: (prefill?: NewPrefill) => void }) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("새 창작물 만들기")}
        className="flex h-full min-h-[148px] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border-strong text-muted transition-colors hover:border-foreground/40 hover:text-foreground data-popup-open:border-foreground/40 data-popup-open:text-foreground"
      >
        <Plus size={22} strokeWidth={1.5} aria-hidden />
        <span className="text-[13px] font-medium">{t("새 창작물")}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-(--anchor-width) min-w-[150px]">
        {([["image", "이미지 업로드", ImagePlus], ["text", "텍스트 업로드", Type]] as const).map(([kind, label, Icon]) => (
          <DropdownMenuItem key={kind} onClick={() => onNew({ kind })}>
            <Icon size={15} strokeWidth={1.7} />
            {t(label)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 아직 만든 결과물이 없을 때(비로그인 포함) 격자에 놓이는 시작 카드 — 결과물 카드와 같은 모양이고, 누르면 그 주제로 새 창작물 창이 열린다. */
function StarterCard({ starter, onNew }: { starter: (typeof STARTERS)[number]; onNew: (prefill?: NewPrefill) => void }) {
  const t = useT();
  return (
    <button onClick={() => onNew({ topic: starter.topic })} className={`${CARD_FACE} w-full text-left`}>
      <span className="text-[12px] font-medium text-faint">{t(starter.cover)}</span>
      <span>
        <span className="block text-[15px] font-semibold leading-snug">{t(starter.label)}</span>
        <span className="mt-1 line-clamp-2 block text-[12px] leading-relaxed text-muted">{t(starter.hint)}</span>
      </span>
    </button>
  );
}

const dateFmts = {
  ko: new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }),
  en: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }),
};

function Card({ c, onDelete }: { c: CardItem; onDelete: (c: CardItem) => void }) {
  const { lang, t } = useLang();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const Icon = c.kind === "learning" ? BookOpen : FileText;
  const kindText = c.kind === "learning" ? `${c.done} / ${c.total}` : c.output === "essay" ? t("완성 원고") : t("실행 계획");
  return (
    <div className="group/card relative">
      <Link href={c.href} className={CARD_FACE}>
        {/* 결과물에는 이미지가 없으니 "무슨 과목인가"를 맨 위에 작게, 제목을 크게 둔다 */}
        <span className="flex items-center gap-1.5 pr-8 text-[12px] font-medium text-faint">
          <Icon size={13} strokeWidth={1.7} aria-hidden />
          <span className="truncate">{c.subject}</span>
        </span>
        <span>
          <span className="line-clamp-2 block text-[15px] font-semibold leading-snug">{c.title}</span>
          <span className="mt-1 block truncate text-[12px] text-muted">
            {kindText} · {dateFmts[lang].format(new Date(c.at))}
          </span>
        </span>
      </Link>
      <div className="absolute right-2 top-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t("더보기")}
            className="grid h-7 w-7 place-items-center rounded-md text-muted opacity-0 transition-opacity hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover/card:opacity-100 data-popup-open:bg-background data-popup-open:opacity-100"
          >
            <Ellipsis size={16} strokeWidth={1.8} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36 min-w-0">
            <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 size={14} strokeWidth={1.7} />
              {t("휴지통으로")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("휴지통으로 옮길까요?")}</AlertDialogTitle>
            <AlertDialogDescription>{t("휴지통에서 되돌릴 수 있어요.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("취소")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(c)}>{t("휴지통으로")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
              <Input
                id="home-search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("제목이나 과목으로 검색")}
                className="w-40 sm:w-56"
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
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TabsList aria-label={t("보기 분류")}>
                {FILTERS.map((f) => (
                  <TabsTrigger key={f.id} value={f.id}>
                    {t(f.label)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
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
