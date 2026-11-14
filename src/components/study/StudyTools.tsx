"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { CircleHelp, FileText, GraduationCap, Layers, NotebookText, type LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n";

export type StudyToolId = "summary" | "flashcards" | "quiz" | "exam";
export interface ActiveStudyTool {
  id: StudyToolId;
  /** true면 이미 만들어 둔 자료를 이어서 연다(새로 만들지 않아 하루 횟수 제한에 걸리지 않는다). */
  reuse: boolean;
}

export const STUDY_TOOLS: { id: StudyToolId; label: string; hint: string; icon: LucideIcon }[] = [
  // 설명에 **무엇이 들어 있는지**를 적는다 — 개념이 들어가는 도구는 "개념"이라고 밝힌다(2026-11-13).
  { id: "summary", label: "요약", hint: "핵심 + 개념 정리", icon: NotebookText },
  { id: "flashcards", label: "플래시카드", hint: "개념 카드 뒤집기", icon: Layers },
  { id: "quiz", label: "퀴즈", hint: "빈칸·단답 퀴즈", icon: CircleHelp },
  { id: "exam", label: "가상 시험", hint: "빈 종이에 써 보기", icon: GraduationCap },
];

// 위쪽 탭과 오른쪽 공부 도구(StudyRail)가 "지금 열린 도구"를 함께 쓰게 하는 공유 상태.
// 이 제공자가 없는 화면(학습 모드·AI 튜터)에서는 StudyRail이 예전처럼 자기 상태를 쓴다.
const Ctx = createContext<{ tool: ActiveStudyTool | null; setTool: (t: ActiveStudyTool | null) => void } | null>(null);

export function StudyToolsProvider({ children }: { children: ReactNode }) {
  const [tool, setTool] = useState<ActiveStudyTool | null>(null);
  return <Ctx.Provider value={{ tool, setTool }}>{children}</Ctx.Provider>;
}

export function useSharedStudyTool() {
  return useContext(Ctx);
}

/**
 * 결과물 화면 맨 위의 탭: 결과물 | 요약 | 플래시카드 | 퀴즈 | 가상 시험.
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
