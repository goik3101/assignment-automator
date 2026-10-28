"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ChevronRight,
  CircleHelp,
  GraduationCap,
  Layers,
  MessageCircle,
  NotebookText,
  PanelRightClose,
  PanelRightOpen,
  SquarePen,
  type LucideIcon,
} from "lucide-react";
import ChatView from "@/components/chat/ChatView";
import { useChat } from "@/components/chat/useChat";
import SummaryModal from "./SummaryModal";
import FlashcardsModal from "./FlashcardsModal";
import QuizModal from "./QuizModal";
import ExamModal from "./ExamModal";
import { listSavedStudy, type StudyRef } from "./useStudyData";
import { useLang, useT } from "@/lib/i18n";

type Tool = "summary" | "flashcards" | "quiz" | "exam";

const TOOLS: { id: Tool; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "summary", label: "요약", hint: "핵심만 한눈에", icon: NotebookText },
  { id: "flashcards", label: "플래시카드", hint: "외울 것 반복", icon: Layers },
  { id: "quiz", label: "퀴즈", hint: "이해했는지 확인", icon: CircleHelp },
  { id: "exam", label: "가상 시험", hint: "빈 종이에 써 보기", icon: GraduationCap },
];

const COLLAPSED_KEY = "studed-ui:study-rail-collapsed";

/**
 * 과제 화면 오른쪽의 공부 도구: 요약 · 플래시카드 · 퀴즈 · 가상 시험(각각 큰 창으로 열림) + 이 과제에 대해 묻는 AI 채팅.
 * 자동 작성 모드의 결과물과 학습 모드의 과제 모두 같은 구성을 쓴다. 내용은 서버가 id로 직접 읽어 온다.
 * 넓은 화면에서는 접어서 아이콘 줄만 남길 수 있다(접힘 여부는 브라우저에 기억).
 * 넓은 화면에서는 처음 놓인 자리에 그대로 고정된다 — 스크롤해도 위로 밀려 올라가지 않고, 화면 아래 끝까지 채운다.
 */
export default function StudyRail({
  studyRef,
  title,
  className = "",
  lockedReason,
  hideChat = false,
}: {
  /** 아직 저장된 과제가 없으면(생성 중이거나 비로그인) null — 그때는 lockedReason을 보여주고 도구를 잠근다. */
  studyRef: StudyRef | null;
  title: string;
  className?: string;
  lockedReason?: string;
  /** AI 튜터 화면처럼 큰 대화창이 따로 있으면 레일 안의 작은 AI 채팅은 숨긴다. */
  hideChat?: boolean;
}) {
  const t = useT();
  const { lang } = useLang();
  const [tool, setTool] = useState<{ id: Tool; reuse: boolean } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [saved, setSaved] = useState<{ tool: string; at: number }[]>([]);
  const [pinTop, setPinTop] = useState<number | null>(null);
  const railRef = useRef<HTMLElement>(null);
  const chat = useChat(studyRef);
  const locked = !studyRef;
  const close = () => setTool(null);
  // 이미 만들어 둔 자료가 있으면 새로 만들지 않고 이어서 연다(하루 1회 제한에 걸리지 않게).
  const open = (id: Tool) => setTool({ id, reuse: saved.some((s) => s.tool === id) });
  const openExam = () => open("exam");

  useEffect(() => {
    // 브라우저 저장소는 마운트 뒤에만 읽을 수 있다(서버 렌더와 어긋나지 않게).
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // 저장소가 막힌 환경 — 펼친 상태로 시작한다.
    }
  }, []);

  // 도구 창을 닫을 때마다 다시 읽어서 방금 만든 자료가 "내 학습"에 바로 나타나게 한다.
  useEffect(() => {
    if (!studyRef || tool) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(listSavedStudy(studyRef, lang));
  }, [studyRef?.kind, studyRef?.id, lang, tool]); // eslint-disable-line react-hooks/exhaustive-deps

  // 고정 위치 = 처음(스크롤 0일 때) 놓인 자리. 레일 자신은 고정 중이라 위치가 바뀌므로 부모(격자)의 문서상 위치로 잰다.
  // 위쪽 제목·진행 표시가 바뀌거나 창 크기가 바뀌면 다시 잰다.
  useEffect(() => {
    const grid = railRef.current?.parentElement;
    if (!grid) return;
    const measure = () => {
      const natural = grid.getBoundingClientRect().top + window.scrollY;
      setPinTop(Math.round(Math.max(24, Math.min(natural, window.innerHeight * 0.4))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const toggle = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
  };

  const savedTools = TOOLS.flatMap((x) => {
    const hit = saved.find((s) => s.tool === x.id);
    return hit ? [{ ...x, at: hit.at }] : [];
  }).sort((a, b) => b.at - a.at);
  const dateFmt = (at: number) => new Date(at).toLocaleDateString(lang === "en" ? "en-US" : "ko-KR", { month: "short", day: "numeric" });

  return (
    <aside
      ref={railRef}
      aria-label={t("공부 도구")}
      style={{ "--rail-top": `${pinTop ?? 24}px` } as CSSProperties}
      className={[
        "min-h-0 lg:sticky lg:top-[var(--rail-top)] lg:h-[calc(100vh-var(--rail-top)-1.5rem)]",
        collapsed ? "lg:w-12" : "lg:w-[360px] xl:w-[380px]",
        className,
      ].join(" ")}
    >
      {collapsed && (
        <div className="hidden h-full flex-col items-center gap-2 lg:flex">
          <button
            onClick={() => toggle(false)}
            aria-label={t("공부 도구 펼치기")}
            title={t("공부 도구 펼치기")}
            className="grid h-10 w-10 place-items-center rounded-xl text-muted transition-colors hover:bg-raised hover:text-foreground"
          >
            <PanelRightOpen size={18} strokeWidth={1.8} />
          </button>
          <div className="my-1 h-px w-6 bg-border" />
          {TOOLS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTool({ id, reuse: false })}
              disabled={locked}
              aria-label={t(label)}
              title={t(label)}
              className="grid h-10 w-10 place-items-center rounded-xl bg-surface text-foreground/80 transition-colors hover:bg-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon size={18} strokeWidth={1.6} />
            </button>
          ))}
          {!hideChat && (
            <button
              onClick={() => toggle(false)}
              aria-label={t("AI 채팅")}
              title={t("AI 채팅")}
              className="grid h-10 w-10 place-items-center rounded-xl bg-surface text-foreground/80 transition-colors hover:bg-raised hover:text-foreground"
            >
              <MessageCircle size={18} strokeWidth={1.6} />
            </button>
          )}
        </div>
      )}

      <div className={["flex h-full min-h-0 flex-col gap-6 lg:overflow-y-auto", collapsed ? "lg:hidden" : ""].join(" ")}>
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-muted">{t("만들기")}</h2>
            <button
              onClick={() => toggle(true)}
              aria-label={t("공부 도구 접기")}
              title={t("공부 도구 접기")}
              className="hidden h-7 w-7 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-foreground lg:grid"
            >
              <PanelRightClose size={16} strokeWidth={1.8} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {TOOLS.map(({ id, label, hint, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTool({ id, reuse: false })}
                disabled={locked}
                className="group flex min-h-[76px] items-center gap-3.5 rounded-2xl bg-surface px-4 py-3.5 text-left transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-background text-foreground/80 transition-colors group-hover:text-foreground">
                  <Icon size={22} strokeWidth={1.6} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold leading-tight">{t(label)}</span>
                  <span className="mt-1 block truncate text-xs leading-snug text-muted">{t(hint)}</span>
                </span>
              </button>
            ))}
          </div>
          {locked && lockedReason && <p className="mt-3 text-xs leading-relaxed text-muted">{lockedReason}</p>}
        </section>

        {savedTools.length > 0 && (
          <section aria-label={t("내 학습")}>
            <h2 className="mb-3 text-[13px] font-semibold text-muted">{t("내 학습")}</h2>
            <ul className="space-y-1.5">
              {savedTools.map(({ id, label, icon: Icon, at }) => (
                <li key={id}>
                  <button
                    onClick={() => setTool({ id, reuse: true })}
                    className="group flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-left transition-colors hover:bg-raised"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background text-foreground/80">
                      <Icon size={16} strokeWidth={1.6} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold leading-tight">{t(label)}</span>
                      <span className="mt-0.5 block text-xs text-muted">{t("{date}에 만듦", { date: dateFmt(at) })}</span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted transition-colors group-hover:text-foreground">
                      {t("이어서 하기")}
                      <ChevronRight size={14} strokeWidth={1.8} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!hideChat && (
        <section aria-label={t("AI 채팅")} className="flex min-h-[300px] flex-1 flex-col lg:min-h-[260px]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted">
              <MessageCircle size={14} strokeWidth={1.8} />
              {t("AI 채팅")}
            </h2>
            {chat.messages.length > 0 && (
              <button
                onClick={chat.reset}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-raised hover:text-foreground"
              >
                <SquarePen size={12} strokeWidth={1.8} />
                {t("새 대화")}
              </button>
            )}
          </div>
          <ChatView
            chat={chat}
            onMemorizeTool={(id) => open(id)}
            // 안내가 빠져 대화 목록이 비어도 입력창은 맨 아래에 둔다.
            className="flex-1 justify-end"
            placeholder={t("이 과제에 대해 무엇이든 물어보세요")}
            disabledReason={locked ? t("결과물이 저장되면 쓸 수 있어요") : null}
            messagesClassName="max-h-[46vh] lg:max-h-none"
            empty={
              // 학습 자료를 하나라도 만들었으면 예시 질문 안내는 접고 "내 학습"에 자리를 내준다.
              savedTools.length > 0 ? undefined : (
                <div className="rounded-2xl bg-surface p-4 text-[13px] leading-relaxed text-muted">
                  {t("“{title}”에 대해 궁금한 점을 물어보세요. 예를 들어 이런 질문을 할 수 있어요.", { title })}
                  <ul className="mt-2 space-y-1 text-foreground/80">
                    <li>{t("· 발표에서 나올 만한 질문 알려줘")}</li>
                    <li>{t("· 이 부분을 더 쉽게 설명해 줘")}</li>
                    <li>{t("· 결론을 어떻게 말하면 좋을까?")}</li>
                  </ul>
                </div>
              )
            }
          />
        </section>
        )}
      </div>

      {studyRef && tool?.id === "summary" && <SummaryModal studyRef={studyRef} onClose={close} reuse={tool.reuse} onOpenExam={openExam} />}
      {studyRef && tool?.id === "flashcards" && <FlashcardsModal studyRef={studyRef} onClose={close} reuse={tool.reuse} onOpenExam={openExam} />}
      {studyRef && tool?.id === "quiz" && <QuizModal studyRef={studyRef} onClose={close} reuse={tool.reuse} onOpenExam={openExam} />}
      {studyRef && tool?.id === "exam" && <ExamModal studyRef={studyRef} onClose={close} reuse={tool.reuse} />}
    </aside>
  );
}
