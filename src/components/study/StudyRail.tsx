"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronRight, GraduationCap, MessageCircle, MessageCircleQuestion, PanelRightClose, PanelRightOpen, PencilLine, SquarePen, X, type LucideIcon } from "lucide-react";
import ChatView from "@/components/chat/ChatView";
import { useChat } from "@/components/chat/useChat";
import SummaryModal from "./SummaryModal";
import FlashcardsModal from "./FlashcardsModal";
import ConceptsModal from "./ConceptsModal";
import QuizModal, { MemorizeModal } from "./QuizModal";
import ExamModal from "./ExamModal";
import { clearSavedStudy, listSavedStudy, type StudyRef } from "./useStudyData";
import { useRouter } from "next/navigation";
import { RAIL_WIDTH } from "./layout";
import { STUDY_TOOLS as TOOLS, useSharedStudyTool, type ActiveStudyTool, type StudyToolId } from "./StudyTools";
import { useLang, useT } from "@/lib/i18n";

type Tool = StudyToolId;

const COLLAPSED_KEY = "studed-ui:study-rail-collapsed";

// 채팅이 비었을 때 보여 주는 "할 수 있는 일". 결과물을 칸 단위로 고쳐 적용하는 건 AI가 쓴 결과물 화면에서만 되므로 그 밖에서는 설명을 바꾼다.
const CHAT_ABILITIES: { icon: LucideIcon; title: string; desc: string; descReadOnly?: string }[] = [
  {
    icon: PencilLine,
    title: "결과물 수정",
    desc: "고치고 싶은 부분을 말하면 고친 글을 보여 주고, 마음에 들면 결과물에 바로 적용해요.",
    descReadOnly: "고치고 싶은 부분을 말하면 고친 글을 제안해 줘요.",
  },
  { icon: MessageCircleQuestion, title: "모르는 문장 질문", desc: "이해가 안 되는 문장이나 용어를 붙여 넣으면 쉽게 풀어 줘요." },
  { icon: GraduationCap, title: "발표·시험 준비", desc: "예상 질문을 뽑거나 외우기 쉽게 정리해 달라고 할 수 있어요." },
];

// fill이 true인 문장은 끝에 내용을 이어 써야 해서 입력칸만 채우고, 아니면 바로 보낸다.
const CHAT_STARTERS: { text: string; fill: boolean }[] = [
  { text: "이 부분을 더 간결하게 고쳐줘: ", fill: true },
  { text: "이 문장이 무슨 뜻인지 쉽게 설명해줘: ", fill: true },
  { text: "발표에서 나올 만한 질문 알려줘", fill: false },
];

/**
 * 과제 화면 오른쪽의 공부 도구: 요약 · 개념 · 플래시카드 · 퀴즈 · 암기 · 가상 시험(각각 큰 창으로 열림) + 이 과제에 대해 묻는 AI 튜터.
 * 자동 작성 모드의 결과물과 학습 모드의 과제 모두 같은 구성을 쓴다. 내용은 서버가 id로 직접 읽어 온다.
 * 넓은 화면에서는 접어서 아이콘 줄만 남길 수 있다(접힘 여부는 브라우저에 기억).
 * 넓은 화면에서는 처음 놓인 자리에 그대로 고정된다 — 스크롤해도 위로 밀려 올라가지 않고, 화면 아래 끝까지 채운다.
 */
export default function StudyRail({
  studyRef,
  className = "",
  lockedReason,
  hideChat = false,
  onResultEdited,
}: {
  /** 아직 저장된 과제가 없으면(생성 중이거나 비로그인) null — 그때는 lockedReason을 보여주고 도구를 잠근다. */
  studyRef: StudyRef | null;
  title: string;
  className?: string;
  lockedReason?: string;
  /** AI 튜터 화면처럼 큰 대화창이 따로 있으면 레일 안의 작은 AI 튜터 채팅은 숨긴다. */
  hideChat?: boolean;
  /** 채팅의 수정안이 결과물에 적용(또는 되돌리기)되면 부른다 — 결과물을 상태로 들고 있는 화면이 그 칸을 바꿔 그리게. */
  onResultEdited?: (heading: string, markdown: string) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  // 위쪽 탭(StudyTabs)이 같은 화면에 있으면 "지금 열린 도구"를 그것과 함께 쓴다.
  const shared = useSharedStudyTool();
  const [localTool, setLocalTool] = useState<ActiveStudyTool | null>(null);
  const tool = shared ? shared.tool : localTool;
  const setTool = shared ? shared.setTool : setLocalTool;
  const [collapsed, setCollapsed] = useState(false);
  const [saved, setSaved] = useState<{ tool: string; at: number }[]>([]);
  const [pinTop, setPinTop] = useState<number | null>(null);
  const railRef = useRef<HTMLElement>(null);
  const chat = useChat(studyRef);
  // 다른 결과물로 바뀌면(다시 만들기 등) 이전 결과물 이야기가 이어지지 않게 대화를 비운다. 처음 저장돼 null→값이 되는 때는 비우지 않는다.
  const lastRefId = useRef<string | null>(studyRef?.id ?? null);
  useEffect(() => {
    const id = studyRef?.id ?? null;
    if (lastRefId.current && id && id !== lastRefId.current) chat.reset();
    if (id) lastRefId.current = id;
  }, [studyRef?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const router = useRouter();
  // 채팅이 낸 칸 수정안을 저장된 결과물에 반영한다(AI가 쓴 결과물 화면에서만). 서버는 글만 바꾸고, 그 글로 만든 요약·시험 캐시는 여기서 지운다.
  const canEdit = !!studyRef && (studyRef.kind === "history" || studyRef.kind === "submission");
  async function sendEdit(heading: string, markdown: string): Promise<string> {
    const res = await fetch("/api/results/edit-section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: { kind: studyRef!.kind, id: studyRef!.id }, heading, markdown }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as { error?: string }).error ?? t("적용하지 못했어요. 잠시 후 다시 시도해 주세요."));
    clearSavedStudy(studyRef!);
    setSaved([]);
    onResultEdited?.(heading, (json as { markdown: string }).markdown);
    router.refresh();
    return (json as { before: string }).before;
  }
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

  // 레일 안의 채팅과 좁은 화면의 전체 화면 채팅(위쪽 탭의 "AI 튜터")이 같은 대화를 쓴다.
  const renderChat = (inSheet: boolean) => (
    <ChatView
      chat={chat}
      onMemorizeTool={(id) => open(id)}
      onApplyEdit={canEdit ? (e) => sendEdit(e.heading, e.markdown) : undefined}
      onUndoEdit={canEdit ? async (heading, before) => void (await sendEdit(heading, before)) : undefined}
      // 안내가 빠져 대화 목록이 비어도 입력창은 맨 아래에 둔다.
      className="flex-1 justify-end"
      placeholder={t("이 결과물에 대해 무엇이든 물어보세요")}
      disabledReason={locked ? t("결과물이 저장되면 쓸 수 있어요") : null}
      messagesClassName={inSheet ? "" : "max-h-[46dvh] lg:max-h-none"}
      empty={
        // 학습 자료를 하나라도 만들었으면 안내는 접고 "내 학습"에 자리를 내준다.
        !inSheet && savedTools.length > 0
          ? undefined
          : ({ fill }) => (
              <div className="text-[13px] leading-relaxed">
                <p className="font-semibold text-foreground">{t("이 결과물로 이런 걸 할 수 있어요")}</p>
                <ul className="mt-3 space-y-3">
                  {CHAT_ABILITIES.map(({ icon: Icon, title: name, desc, descReadOnly }) => (
                    <li key={name} className="flex gap-3">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface text-muted">
                        <Icon size={15} strokeWidth={1.7} aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium text-foreground">{t(name)}</span>
                        <span className="block text-xs leading-relaxed text-muted">{t(canEdit || !descReadOnly ? desc : descReadOnly)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {/* 문장을 붙여 넣어야 하는 질문은 입력칸을 채워 주고, 그대로 물어도 되는 질문은 바로 보낸다 */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {CHAT_STARTERS.map(({ text, fill: partial }) => (
                    <button
                      key={text}
                      onClick={() => (partial ? fill(t(text)) : void chat.send(t(text), null))}
                      disabled={locked || chat.busy}
                      className="rounded-full border border-border-strong px-3 py-1.5 text-left text-xs font-medium text-muted transition-colors hover:bg-raised hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t(text).replace(/[:：]\s*$/, "…")}
                    </button>
                  ))}
                </div>
              </div>
            )
      }
    />
  );

  return (
    <aside
      ref={railRef}
      aria-label={t("공부 도구")}
      style={{ "--rail-top": `${pinTop ?? 24}px` } as CSSProperties}
      className={[
        "min-h-0 lg:sticky lg:top-[var(--rail-top)] lg:h-[calc(100dvh-var(--rail-top)-1.5rem)]",
        collapsed ? "lg:w-12" : RAIL_WIDTH,
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
              aria-label={t("AI 튜터")}
              title={t("AI 튜터")}
              className="grid h-10 w-10 place-items-center rounded-xl bg-surface text-foreground/80 transition-colors hover:bg-raised hover:text-foreground"
            >
              <MessageCircle size={18} strokeWidth={1.6} />
            </button>
          )}
        </div>
      )}

      <div className={["flex h-full min-h-0 flex-col gap-6 lg:overflow-y-auto", collapsed ? "lg:hidden" : ""].join(" ")}>
        <section>
          {/* 위쪽 탭(StudyTabs)이 같은 화면에 있으면 좁은 화면에서는 같은 기능이 두 번 나오지 않게 이 카드를 숨긴다 */}
          <div className={["mb-3 flex items-center justify-between", shared ? "max-lg:hidden" : ""].join(" ")}>
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
          {/* 레일이 넓으면(@[26rem] 이상) 아이콘을 왼쪽에 두는 가로 타일, 좁으면 세로 타일. 이름은 크게, 설명은 두 줄까지 */}
          <div className={["@container", shared ? "max-lg:hidden" : ""].join(" ")}>
            <div className="grid grid-cols-2 gap-2.5">
            {TOOLS.map(({ id, label, hint, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTool({ id, reuse: false })}
                disabled={locked}
                className="group flex flex-col items-start gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-3.5 text-left transition-colors hover:border-border-strong hover:bg-raised/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-surface @[26rem]:min-h-[72px] @[26rem]:flex-row @[26rem]:items-center @[26rem]:gap-3"
              >
                <span className="grid shrink-0 place-items-center text-muted transition-colors group-hover:text-foreground @[26rem]:h-9 @[26rem]:w-9 @[26rem]:rounded-lg @[26rem]:bg-raised">
                  <Icon size={18} strokeWidth={1.6} aria-hidden />
                </span>
                <span className="min-w-0 max-w-full">
                  <span className="block text-[14px] font-semibold leading-tight">{t(label)}</span>
                  <span className="mt-1 line-clamp-2 text-xs leading-snug text-muted">{t(hint)}</span>
                </span>
              </button>
            ))}
            </div>
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
                    className="group flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-left transition-colors hover:border-border-strong hover:bg-raised/60"
                  >
                    <Icon size={16} strokeWidth={1.6} className="shrink-0 text-muted" aria-hidden />
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
        <section aria-label={t("AI 튜터")} className={["flex min-h-[300px] flex-1 flex-col lg:min-h-[260px]", shared ? "max-lg:hidden" : ""].join(" ")}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted">
              <MessageCircle size={14} strokeWidth={1.8} />
              {t("AI 튜터")}
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
          {renderChat(false)}
        </section>
        )}
      </div>

      {!hideChat && shared && tool?.id === "chat" && (
        <div role="dialog" aria-modal="true" aria-label={t("AI 튜터")} className="fixed inset-x-0 top-0 z-50 flex h-dvh flex-col bg-background lg:hidden">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border pl-4 pr-2">
            <h2 className="inline-flex items-center gap-1.5 text-[15px] font-semibold">
              <MessageCircle size={16} strokeWidth={1.8} aria-hidden />
              {t("AI 튜터")}
            </h2>
            <div className="flex items-center gap-1">
              {chat.messages.length > 0 && (
                <button
                  onClick={chat.reset}
                  className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs font-medium text-muted transition-colors hover:bg-raised hover:text-foreground"
                >
                  <SquarePen size={12} strokeWidth={1.8} />
                  {t("새 대화")}
                </button>
              )}
              <button
                onClick={close}
                aria-label={t("닫기")}
                className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-foreground"
              >
                <X size={18} strokeWidth={1.8} />
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-4">{renderChat(true)}</div>
        </div>
      )}
      {studyRef && tool?.id === "summary" && <SummaryModal studyRef={studyRef} onClose={close} reuse={tool.reuse} onOpenConcepts={() => open("concepts")} />}
      {studyRef && tool?.id === "concepts" && <ConceptsModal studyRef={studyRef} onClose={close} reuse={tool.reuse} onOpenFlashcards={() => open("flashcards")} />}
      {studyRef && tool?.id === "flashcards" && <FlashcardsModal studyRef={studyRef} onClose={close} onOpenQuiz={() => open("quiz")} />}
      {studyRef && tool?.id === "quiz" && <QuizModal studyRef={studyRef} onClose={close} onOpenMemorize={() => open("memorize")} />}
      {studyRef && tool?.id === "memorize" && <MemorizeModal studyRef={studyRef} onClose={close} onOpenExam={openExam} />}
      {studyRef && tool?.id === "exam" && <ExamModal studyRef={studyRef} onClose={close} reuse={tool.reuse} />}
    </aside>
  );
}
