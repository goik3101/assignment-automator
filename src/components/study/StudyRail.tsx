"use client";

import { useState } from "react";
import { CircleHelp, GraduationCap, Layers, MessageCircle, NotebookText, SquarePen, type LucideIcon } from "lucide-react";
import ChatView from "@/components/chat/ChatView";
import { useChat } from "@/components/chat/useChat";
import SummaryModal from "./SummaryModal";
import FlashcardsModal from "./FlashcardsModal";
import QuizModal from "./QuizModal";
import ExamModal from "./ExamModal";
import type { StudyRef } from "./useStudyData";
import { useT } from "@/lib/i18n";

type Tool = "summary" | "flashcards" | "quiz" | "exam";

const TOOLS: { id: Tool; label: string; hint: string; icon: LucideIcon }[] = [
  { id: "summary", label: "요약", hint: "핵심만 한눈에", icon: NotebookText },
  { id: "flashcards", label: "플래시카드", hint: "외울 것 반복", icon: Layers },
  { id: "quiz", label: "퀴즈", hint: "이해했는지 확인", icon: CircleHelp },
  { id: "exam", label: "가상 시험", hint: "빈 종이에 써 보기", icon: GraduationCap },
];

/**
 * 과제 화면 오른쪽의 공부 도구: 요약 · 플래시카드 · 퀴즈 · 가상 시험(각각 큰 창으로 열림) + 이 과제에 대해 묻는 AI 채팅.
 * 자동 작성 모드의 결과물과 학습 모드의 과제 모두 같은 구성을 쓴다. 내용은 서버가 id로 직접 읽어 온다.
 */
export default function StudyRail({
  studyRef,
  title,
  className = "",
  lockedReason,
}: {
  /** 아직 저장된 과제가 없으면(생성 중이거나 비로그인) null — 그때는 lockedReason을 보여주고 도구를 잠근다. */
  studyRef: StudyRef | null;
  title: string;
  className?: string;
  lockedReason?: string;
}) {
  const t = useT();
  const [tool, setTool] = useState<Tool | null>(null);
  const chat = useChat(studyRef);
  const locked = !studyRef;
  const close = () => setTool(null);

  return (
    <aside aria-label={t("공부 도구")} className={["flex min-h-0 flex-col gap-7 lg:overflow-y-auto", className].join(" ")}>
      <section>
        <h2 className="mb-3 text-[13px] font-semibold text-muted">{t("만들기")}</h2>
        <div className="grid grid-cols-2 gap-3">
          {TOOLS.map(({ id, label, hint, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTool(id)}
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

      <section aria-label={t("AI 채팅")} className="flex min-h-[300px] flex-1 flex-col lg:min-h-[420px]">
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
          className="flex-1 justify-between"
          placeholder={t("이 과제에 대해 무엇이든 물어보세요")}
          disabledReason={locked ? t("결과물이 저장되면 쓸 수 있어요") : null}
          messagesClassName="max-h-[46vh] lg:max-h-none"
          empty={
            <div className="rounded-2xl bg-surface p-4 text-[13px] leading-relaxed text-muted">
              {t("“{title}”에 대해 궁금한 점을 물어보세요. 예를 들어 이런 질문을 할 수 있어요.", { title })}
              <ul className="mt-2 space-y-1 text-foreground/80">
                <li>{t("· 발표에서 나올 만한 질문 알려줘")}</li>
                <li>{t("· 이 부분을 더 쉽게 설명해 줘")}</li>
                <li>{t("· 결론을 어떻게 말하면 좋을까?")}</li>
              </ul>
            </div>
          }
        />
      </section>

      {studyRef && tool === "summary" && <SummaryModal studyRef={studyRef} onClose={close} />}
      {studyRef && tool === "flashcards" && <FlashcardsModal studyRef={studyRef} onClose={close} />}
      {studyRef && tool === "quiz" && <QuizModal studyRef={studyRef} onClose={close} />}
      {studyRef && tool === "exam" && <ExamModal studyRef={studyRef} onClose={close} />}
    </aside>
  );
}
