"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowUp, Brain, CircleHelp, FileText, GraduationCap, Layers, Lightbulb, NotebookText, Pencil, Sparkles, type LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n";

export type StudyToolId = "summary" | "concepts" | "flashcards" | "quiz" | "memorize" | "exam";
export interface ActiveStudyTool {
  /** "chat"은 좁은 화면에서 위쪽 탭의 "AI 튜터"로 여는 대화 화면이다(오른쪽 레일이 없는 화면용). */
  id: StudyToolId | "chat";
  /** true면 이미 만들어 둔 자료를 이어서 연다(새로 만들지 않아 하루 횟수 제한에 걸리지 않는다). */
  reuse: boolean;
}

/**
 * 이해(요약·개념) → 암기(플래시카드·퀴즈·암기) → 점검(가상 시험) 순서 6개. 모두 요약 한 번의 호출 결과(결론·칸별 한 줄·낯선 개념·핵심어)를 나눠 쓰므로 모델 호출이 늘지 않는다(2026-11-21):
 * 요약 = 결론+칸별 한 줄, 개념 = 낯선 개념 풀이, 플래시카드 = 뼈대·개념 카드, 퀴즈 = 빈칸 고르기→첫 글자 쓰기, 암기 = 뼈대 한 장+백지 연습(준비도 %).
 */
export const STUDY_TOOLS: { id: StudyToolId; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "summary", label: "요약", hint: "이해 · 결론과 칸별 한 줄", icon: NotebookText },
  { id: "concepts", label: "개념", hint: "이해 · 낯선 말 쉬운 풀이", icon: Lightbulb },
  { id: "flashcards", label: "플래시카드", hint: "암기 · 뼈대·개념 카드", icon: Layers },
  { id: "quiz", label: "퀴즈", hint: "암기 · 빈칸 문제", icon: CircleHelp },
  { id: "memorize", label: "암기", hint: "암기 · 뼈대 외우고 백지 연습", icon: Brain },
  { id: "exam", label: "가상 시험", hint: "점검 · 백지에 써 보기", icon: GraduationCap },
];

// 위쪽 탭과 오른쪽 공부 도구(StudyRail)가 "지금 열린 도구"를 함께 쓰게 하는 공유 상태.
// 폰에서는 채팅(전체 화면)을 여는 길(아래 질문 바·선택한 글 메뉴·칸 제목의 고치기 버튼)도 여기를 거친다:
// ask(글)은 채팅을 열고 입력칸을 그 글로 채워 둔다(보내는 건 학생이 직접).
// 이 제공자가 없는 화면(학습 모드·AI 튜터)에서는 StudyRail이 예전처럼 자기 상태를 쓴다.
interface StudyCtx {
  tool: ActiveStudyTool | null;
  setTool: (t: ActiveStudyTool | null) => void;
  /** 저장된 결과물이 없어(생성 중·비로그인) 채팅·도구를 못 쓰는 상태 */
  locked: boolean;
  /** 채팅을 열 때 입력칸에 채울 글(n은 같은 글을 다시 보내도 새 요청으로 알아보는 번호) */
  draft: { text: string; n: number } | null;
  ask: (text: string) => void;
  openChat: () => void;
}
const Ctx = createContext<StudyCtx | null>(null);

export function StudyToolsProvider({ children, locked = false }: { children: ReactNode; locked?: boolean }) {
  const [tool, setTool] = useState<ActiveStudyTool | null>(null);
  const [draft, setDraft] = useState<StudyCtx["draft"]>(null);
  const ask = useCallback((text: string) => {
    setDraft((d) => ({ text, n: (d?.n ?? 0) + 1 }));
    setTool({ id: "chat", reuse: false });
  }, []);
  // 그냥 열 때는 지난번 초안이 다시 채워지지 않게 비운다.
  const openChat = useCallback(() => {
    setDraft(null);
    setTool({ id: "chat", reuse: false });
  }, []);
  const value = useMemo(() => ({ tool, setTool, locked, draft, ask, openChat }), [tool, locked, draft, ask, openChat]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** 폰에서 질문·수정 요청을 채팅으로 넘기는 함수. 제공자가 없거나 결과물이 아직 저장되지 않았으면 null(버튼을 그리지 않는다). */
export function useStudyAsk(): ((text: string) => void) | null {
  const c = useContext(Ctx);
  return c && !c.locked ? c.ask : null;
}

export function useSharedStudyTool() {
  return useContext(Ctx);
}

/**
 * 결과물 화면 맨 위의 탭: 결과물 | 요약 | 개념 | 플래시카드 | 퀴즈 | 암기 | 가상 시험.
 * 도구 탭을 누르면 오른쪽 "만들기" 카드를 누른 것과 똑같이 그 도구 창이 열리고, 창이 열려 있는 동안 그 탭이 선택돼 보인다.
 * 결과물이 아직 저장되지 않았으면(생성 중·비로그인) 도구 탭은 잠긴다.
 * 핸드폰·좁은 화면에서만 보인다(`lg:hidden`) — 넓은 화면에는 오른쪽 공부 도구가 이미 있어서 겹치지 않게 한다.
 */
export function StudyTabs({ locked = false }: { locked?: boolean }) {
  const t = useT();
  const shared = useContext(Ctx);
  if (!shared) return null;
  const { tool, setTool } = shared;
  const base = "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium transition-colors";
  const on = "bg-foreground text-background";
  const off = "text-muted hover:bg-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted";

  return (
    <nav aria-label={t("공부 도구")} className="-mt-2 mb-6 flex gap-1.5 overflow-x-auto pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button onClick={() => setTool(null)} aria-current={!tool ? "true" : undefined} className={[base, !tool ? on : off].join(" ")}>
        <FileText size={15} strokeWidth={1.8} aria-hidden />
        {t("결과물")}
      </button>
      {STUDY_TOOLS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setTool({ id, reuse: false })}
          disabled={locked}
          aria-current={tool?.id === id ? "true" : undefined}
          className={[base, tool?.id === id ? on : off].join(" ")}
        >
          <Icon size={15} strokeWidth={1.8} aria-hidden />
          {t(label)}
        </button>
      ))}
    </nav>
  );
}

/**
 * 폰 결과물 화면 맨 아래에 붙어 있는 질문 바. 누르면 전체 화면 채팅이 열린다.
 * 탭 줄에 숨어 있던 AI 튜터를 "여기에 물어보면 된다"가 보이는 자리로 옮긴 것 — 질문뿐 아니라 글 수정까지 된다는 걸 문구로 알린다.
 * 넓은 화면(lg 이상)에는 오른쪽 레일에 같은 입력창이 있어 그릴 때 건너뛴다.
 */
export function StudyAskBar() {
  const t = useT();
  const shared = useContext(Ctx);
  if (!shared) return null;
  const { locked, openChat } = shared;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
      <button
        onClick={openChat}
        disabled={locked}
        className="pointer-events-auto flex h-12 w-full items-center gap-2.5 rounded-2xl border border-border-strong bg-surface pl-3.5 pr-2 text-left text-[13.5px] text-muted shadow-[0_6px_24px_rgba(0,0,0,0.18)] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Sparkles size={16} strokeWidth={1.8} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{locked ? t("결과물이 저장되면 쓸 수 있어요") : t("이 결과물에 질문하거나 글을 수정해 보세요")}</span>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground text-background">
          <ArrowUp size={16} strokeWidth={2.2} aria-hidden />
        </span>
      </button>
    </div>
  );
}

/**
 * 폰에서 결과물 글을 길게 눌러 문장을 고르면 그 아래에 뜨는 작은 메뉴: 물어보기 / 고치기.
 * 누르면 채팅이 열리고 입력칸에 고른 문장과 기본 요청이 채워진다(보내기 전에 고칠 수 있다). 결과물 본문(article) 안에서 고른 글에만 뜬다.
 */
export function StudySelectionMenu() {
  const t = useT();
  const shared = useContext(Ctx);
  const [sel, setSel] = useState<{ text: string; x: number; top: number } | null>(null);
  const enabled = !!shared && !shared.locked;
  const ask = shared?.ask;

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // 고르는 동안 selectionchange가 계속 오므로 멈춘 뒤에 한 번만 본다.
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const s = window.getSelection();
        const text = s?.toString().replace(/\s+/g, " ").trim() ?? "";
        const node = s?.anchorNode ?? null;
        const el = node instanceof Element ? node : (node?.parentElement ?? null);
        if (!s || s.rangeCount === 0 || s.isCollapsed || text.length < 2 || !el?.closest("article")) {
          setSel(null);
          return;
        }
        const r = s.getRangeAt(0).getBoundingClientRect();
        // 아래쪽 질문 바와 겹치면 선택 글 위에 띄운다. 폰의 기본 복사 메뉴는 보통 선택 글 위에 뜨므로 기본은 아래.
        const below = r.bottom + 54 < window.innerHeight - 72;
        setSel({ text: text.slice(0, 600), x: Math.min(Math.max(r.left + r.width / 2, 96), window.innerWidth - 96), top: below ? r.bottom + 10 : Math.max(r.top - 52, 8) });
      }, 200);
    };
    document.addEventListener("selectionchange", update);
    return () => {
      document.removeEventListener("selectionchange", update);
      clearTimeout(timer);
    };
  }, [enabled]);

  if (!enabled || !sel || !ask) return null;
  const go = (prompt: string) => {
    window.getSelection()?.removeAllRanges();
    setSel(null);
    ask(prompt);
  };
  const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors hover:bg-raised";
  return (
    <div
      // 버튼을 눌러도 고른 글이 풀리지 않게 한다
      onPointerDown={(e) => e.preventDefault()}
      style={{ left: sel.x, top: sel.top }}
      className="fixed z-40 flex -translate-x-1/2 gap-0.5 rounded-xl border border-border-strong bg-surface p-1 shadow-[0_6px_24px_rgba(0,0,0,0.25)] lg:hidden"
    >
      <button className={btn} onClick={() => go(t("“{text}”\n이 부분이 무슨 뜻인지 쉽게 설명해줘", { text: sel.text }))}>
        <CircleHelp size={14} strokeWidth={1.8} aria-hidden />
        {t("물어보기")}
      </button>
      <button className={btn} onClick={() => go(t("“{text}”\n이 부분을 이렇게 고쳐줘: ", { text: sel.text }))}>
        <Pencil size={14} strokeWidth={1.8} aria-hidden />
        {t("고치기")}
      </button>
    </div>
  );
}
