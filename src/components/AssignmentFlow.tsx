"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import Breadcrumb from "./Breadcrumb";
import type {
  AdministrativeInfo,
  CoreTaskInfo,
  EssayResult,
  InsufficientDataResult,
  PlanResult,
  SourceRef,
  TaskElement,
} from "@/types/task";
import { EssayPanel, PlanPanel } from "./ResultPanel";
import StudyRail from "./study/StudyRail";
import { useAuth } from "@/lib/supabase/use-auth";
import { useT } from "@/lib/i18n";
import HomeDashboard, { type NewPrefill } from "./home/HomeDashboard";
import NewCreationModal, { type AiStartPayload } from "./creation/NewCreationModal";
import { consumeOpenNewFlag, onOpenNewCreation } from "@/lib/ui/new-creation";
import { getSourceScope } from "@/lib/ui/ai-pref";
import { isPresentationTask } from "@/lib/util/presentation";

type Step = "home" | "result";

interface TextStageRef {
  element: TaskElement;
  /** coreTaskInfo.task_elements 안에서의 인덱스 — items 배열 인덱싱용. */
  idx: number;
}

type GeneratedItem =
  | { element: TaskElement; status: "loading" }
  | { element: TaskElement; status: "done"; result: EssayResult | PlanResult }
  | { element: TaskElement; status: "error"; message: string }
  | { element: TaskElement; status: "insufficient"; reason: string };

/** 생성이 시작될 때 확정되는 입력. 생성 함수들이 state 클로저가 아니라 이 값을 그대로 쓴다. */
interface GenerationContext {
  subject: string;
  coreTaskInfo: CoreTaskInfo;
  adminInfo: AdministrativeInfo | null;
  instructions: string;
  turnstileToken: string | null;
}

export default function AssignmentFlow() {
  const { user } = useAuth();
  const t = useT();
  const [step, setStep] = useState<Step>("home");
  // 새 창작물 모달(사진/텍스트 입력 → 분석 → AI/직접 작성 선택). 열 때 미리 채울 값도 함께 받는다.
  const [newOpen, setNewOpen] = useState<NewPrefill | null>(null);
  const [ctx, setCtx] = useState<GenerationContext | null>(null);
  const ctxRef = useRef<GenerationContext | null>(null);

  // 결과 단계
  const [items, setItems] = useState<GeneratedItem[]>([]);
  // 완성 원고 결과의 상단 3줄 요약 — 여러 단계여도 전체를 아우르는 하나의 요약이라 카드들 위에 한 번만 보여준다.
  const [essaySummaryLines, setEssaySummaryLines] = useState<string[]>([]);

  useEffect(() => {
    // 사이드바의 "새 창작물"(다른 화면에서 눌러 홈으로 넘어온 경우 포함)이 모달을 연다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (consumeOpenNewFlag()) setNewOpen({});
    return onOpenNewCreation(() => {
      setStep("home");
      setNewOpen({});
    });
  }, []);

  function setItemDone(idx: number, element: TaskElement, result: EssayResult | PlanResult) {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { element, status: "done", result };
      return next;
    });
  }
  function setItemError(idx: number, element: TaskElement, err: unknown) {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = {
        element,
        status: "error",
        message: err instanceof Error ? err.message : t("생성 중 문제가 생겼어요."),
      };
      return next;
    });
  }
  function setItemInsufficient(idx: number, element: TaskElement, reason: string) {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { element, status: "insufficient", reason };
      return next;
    });
  }

  // 외부 툴로 별도 제작해야 하는 요소(PPT/포스터 등)는 기존 단발성 생성을 그대로 쓴다.
  // fixedSubject: 같은 과제의 완성 원고(text_submission)가 먼저 생성되어 인물/사건 등을 확정했다면 그 값 —
  // 신문 제작 등이 다른 대상을 새로 선정해버리는 인물 혼입을 막기 위해 그대로 넘겨 고정시킨다.
  // referenceFactsText: 위 완성 원고의 전체 텍스트 — 출생/사망 연도 같은 구체적 사실이 essay와 plan에서
  // 서로 다르게 나오는 문제를 막기 위해 그대로 전달한다.
  async function generatePlanElements(
    c: GenerationContext,
    planElements: TextStageRef[],
    fixedSubject?: string,
    referenceFactsText?: string,
    referenceSources?: SourceRef[],
    generationTicket?: string
  ) {
    // 같은 과제의 계획 요청은 표(generationTicket)를 실어 하루 생성 횟수를 한 번만 쓴다. 표가 없고 계획이 여러 개면 첫 계획이 받은 표로 나머지를 보낸다.
    const runOne = async ({ element, idx }: TextStageRef, ticket?: string): Promise<string | undefined> => {
        try {
          const res = await fetch("/api/tasks/generate/plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subject: c.subject,
              coreTaskInfo: c.coreTaskInfo,
              adminInfo: c.adminInfo,
              instructions: c.instructions,
              turnstileToken: c.turnstileToken,
              fixedSubject,
              referenceFactsText,
              referenceSources,
              elementLabel: element.label,
              sourceScope: getSourceScope(),
              generationTicket: ticket,
            }),
          });
          if (!res.ok) throw new Error((await res.json()).error ?? t("생성에 실패했어요."));
          const result: (EssayResult | PlanResult | InsufficientDataResult) & { generationTicket?: string } = await res.json();
          if (result.type === "insufficient_data") setItemInsufficient(idx, element, result.reason);
          else setItemDone(idx, element, result);
          return result.generationTicket;
        } catch (err) {
          setItemError(idx, element, err);
          return undefined;
        }
    };
    if (generationTicket || planElements.length <= 1) {
      await Promise.all(planElements.map((ref) => runOne(ref, generationTicket)));
      return;
    }
    const [first, ...rest] = planElements;
    const ticket = await runOne(first);
    await Promise.all(rest.map((ref) => runOne(ref, ticket)));
  }

  // 완성 원고로 제출 가능한 요소(고민쓰기→친구의 고민 분석→책처방전→편지처럼 이어지는 서술형)를 전부 한 번의
  // 호출로 생성한다 — 같은 컨텍스트 안에서 한 번에 쓰기 때문에, 등장인물 이름·책 정보 같은 사실이 요소 사이에서
  // 어긋날 수가 구조적으로 없다(PROGRESS.md 참고). "이번 과제 한정 지침" 필드에 학생이 입력한 내용도 이 한 번의
  // 호출에 그대로 실려서 반영된다.
  // 반환값: 이 과제가 인물/사건 등을 자유롭게 선정한 유형이면 그 대상 이름(confirmedSubject)과 전체 텍스트(markdown) —
  // 같은 과제에 external_production 요소도 있으면 handleStart()가 이 값을 generatePlanElements에 그대로 넘긴다.
  async function generateTextElements(
    c: GenerationContext,
    textStages: TextStageRef[]
  ): Promise<{ confirmedSubject?: string; markdown?: string; sources?: SourceRef[]; generationTicket?: string } | undefined> {
    try {
      const res = await fetch("/api/tasks/generate/essay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: c.subject,
          coreTaskInfo: c.coreTaskInfo,
          adminInfo: c.adminInfo,
          instructions: c.instructions,
          turnstileToken: c.turnstileToken,
          sourceScope: getSourceScope(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? t("생성에 실패했어요."));
      const result: EssayResult | PlanResult | InsufficientDataResult = await res.json();

      if (result.type === "insufficient_data") {
        for (const { element, idx } of textStages) setItemInsufficient(idx, element, result.reason);
        return undefined;
      }
      if (result.type !== "essay") return undefined;

      setEssaySummaryLines(result.summaryLines ?? []);

      if (result.sections && result.sections.length === textStages.length) {
        textStages.forEach(({ element, idx }, i) => {
          const section = result.sections![i];
          setItemDone(idx, element, {
            type: "essay",
            markdown: section.markdown,
            sources: section.sources,
            lengthWarning: section.lengthWarning,
            authorWarning: section.authorWarning,
            noSourcesWarning: section.noSourcesWarning,
            structureWarning: section.structureWarning,
            productionNotes: section.productionNotes,
            claimCheck: section.claimCheck,
            latency_ms: result.latency_ms,
            submissionId: result.submissionId,
          });
        });
      } else {
        // 요소가 하나뿐이거나(섹션 분리 불필요) 어떤 이유로든 개수가 안 맞으면, 전체 결과를 첫 요소에 그대로 보여준다.
        const [first, ...rest] = textStages;
        setItemDone(first.idx, first.element, result);
        for (const { element, idx } of rest) {
          setItemError(idx, element, new Error(t("이 단계는 따로 표시되지 않았어요. 위 결과를 확인해 주세요.")));
        }
      }
      return { confirmedSubject: result.confirmedSubject, markdown: result.markdown, sources: result.sources, generationTicket: (result as { generationTicket?: string }).generationTicket };
    } catch (err) {
      for (const { element, idx } of textStages) setItemError(idx, element, err);
      return undefined;
    }
  }

  async function handleStart(payload: AiStartPayload) {
    const c: GenerationContext = payload;
    ctxRef.current = c;
    setCtx(c);
    setNewOpen(null);
    const initial: GeneratedItem[] = c.coreTaskInfo.task_elements.map((element) => ({
      element,
      status: "loading",
    }));
    setItems(initial);
    setEssaySummaryLines([]);
    setStep("result");

    const withIndex = c.coreTaskInfo.task_elements.map((element, idx) => ({ element, idx }));
    const textStages = withIndex.filter(({ element }) => element.type === "text_submission");
    const planElements = withIndex.filter(({ element }) => element.type === "external_production");

    if (textStages.length > 0 && planElements.length > 0) {
      // 완성 원고와 실행 계획이 함께 있는 과제는, 완성 원고 쪽이 인물/사건 등을 자유롭게 선정할 수 있다 —
      // 두 호출이 병렬로 각자 다른 대상을 골라버리는 인물 혼입을 막기 위해, 원고를 먼저 생성해 확정된 대상을
      // 실행 계획 생성에 그대로 넘긴다(순서상 조금 느려지지만 일관성이 우선).
      const essayOutcome = await generateTextElements(c, textStages);
      void generatePlanElements(c, planElements, essayOutcome?.confirmedSubject, essayOutcome?.markdown, essayOutcome?.sources, essayOutcome?.generationTicket);
    } else {
      void generatePlanElements(c, planElements);
      if (textStages.length > 0) void generateTextElements(c, textStages);
    }
  }

  async function handleRegenerate(idx: number, revisionInstructions: string) {
    const item = items[idx];
    if (item.status !== "done") return;
    const submissionId = item.result.submissionId;
    if (!submissionId) throw new Error(t("로그인 후 이용할 수 있어요."));

    const res = await fetch(`/api/tasks/${submissionId}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revisionInstructions, sourceScope: getSourceScope() }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? t("다시 만들지 못했어요."));

    const result: EssayResult | PlanResult | InsufficientDataResult = await res.json();
    if (result.type === "insufficient_data") {
      throw new Error(result.reason || t("자료가 부족해 다시 만들기 어려웠어요."));
    }

    // 완성 원고는 요소 여러 개가 한 번에 재생성되므로(같은 submissionId를 공유), 이 결과를 클릭한 패널 하나가
    // 아니라 완성 원고 요소 전체에 다시 나눠 반영한다.
    const info = ctxRef.current?.coreTaskInfo;
    if (result.type === "essay" && result.sections && info) {
      setEssaySummaryLines(result.summaryLines ?? []);
      const textStages = info.task_elements
        .map((element, i) => ({ element, idx: i }))
        .filter(({ element }) => element.type === "text_submission");
      if (result.sections.length === textStages.length) {
        textStages.forEach(({ element, idx: i }, sIdx) => {
          const section = result.sections![sIdx];
          setItemDone(i, element, {
            type: "essay",
            markdown: section.markdown,
            sources: section.sources,
            lengthWarning: section.lengthWarning,
            authorWarning: section.authorWarning,
            noSourcesWarning: section.noSourcesWarning,
            structureWarning: section.structureWarning,
            productionNotes: section.productionNotes,
            claimCheck: section.claimCheck,
            latency_ms: result.latency_ms,
            submissionId: result.submissionId,
          });
        });
        return;
      }
    }

    setItemDone(idx, item.element, result);
  }

  const modal = newOpen && (
    <NewCreationModal
      onClose={() => setNewOpen(null)}
      onStartAi={handleStart}
      initialTopic={newOpen.topic}
      initialImage={newOpen.image ?? null}
      initialKind={newOpen.kind}
    />
  );

  if (step === "home") {
    return (
      <>
        <HomeDashboard onNew={(prefill) => setNewOpen(prefill ?? {})} />
        {modal}
      </>
    );
  }

  const info = ctx?.coreTaskInfo ?? null;
  const loadingCount = items.filter((i) => i.status === "loading").length;
  // 학습 도구(요약·카드·퀴즈·시험·채팅)는 저장된 결과물(submissionId)이 있어야 쓸 수 있다 — 로그인 사용자만 저장된다.
  const submissionId = items.flatMap((i) => (i.status === "done" && i.result.submissionId ? [i.result.submissionId] : []))[0];

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-8 md:px-10 md:py-10">
      <header className="mb-8">
        <Breadcrumb title={info?.topic ?? t("새 창작물")} onHome={() => setStep("home")} />
        <h1 className="text-2xl font-bold tracking-tight">{info?.topic ?? t("새 창작물")}</h1>
        {ctx && <p className="mt-1.5 text-sm text-muted">{t("{subject} · AI가 만든 결과물", { subject: ctx.subject })}</p>}
        {loadingCount > 0 && (
          <p role="status" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-muted">
            <LoaderCircle size={14} strokeWidth={1.8} className="animate-spin" />
            {t("자료를 조사하고 글을 쓰는 중이에요. 최대 2~3분 걸릴 수 있어요.")}
          </p>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div className="min-w-0 space-y-6">
        {essaySummaryLines.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface p-5">
            <p className="mb-2.5 text-xs font-semibold text-faint">{t("전체 요약")}</p>
            <ul className="space-y-1.5 text-sm leading-relaxed">
              {essaySummaryLines.map((line, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" aria-hidden />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {items.map((item, idx) => {
          if (item.status === "loading") {
            return (
              <div
                key={idx}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-6 text-sm text-muted"
              >
                <LoaderCircle size={16} strokeWidth={1.8} className="animate-spin" />
                {t("{label} 만드는 중...", { label: item.element.label })}
              </div>
            );
          }
          if (item.status === "error") {
            return (
              <div key={idx} className="flex gap-3 rounded-2xl border border-danger/50 p-5 text-sm text-danger">
                <CircleAlert size={18} strokeWidth={1.7} className="mt-0.5 shrink-0" />
                <p>
                  <b>{item.element.label}</b>: {item.message}
                </p>
              </div>
            );
          }
          if (item.status === "insufficient") {
            return (
              <div key={idx} className="flex gap-3 rounded-2xl border border-border-strong p-5 text-sm text-muted">
                <CircleAlert size={18} strokeWidth={1.7} className="mt-0.5 shrink-0" />
                <p>
                  <b className="text-foreground">{item.element.label}</b>: {t("자료가 부족해 정확하게 만들기 어려웠어요. ({reason})", { reason: item.reason })}
                </p>
              </div>
            );
          }
          const showQuestions = info ? isPresentationTask(info) : false;
          return item.result.type === "essay" ? (
            <EssayPanel
              key={idx}
              label={item.element.label}
              result={item.result}
              onRegenerate={(text) => handleRegenerate(idx, text)}
              topic={info?.topic}
              showExpectedQuestions={showQuestions}
            />
          ) : (
            <PlanPanel
              key={idx}
              label={item.element.label}
              result={item.result}
              onRegenerate={(text) => handleRegenerate(idx, text)}
              topic={info?.topic}
              showExpectedQuestions={showQuestions}
            />
          );
        })}
      </div>
        <StudyRail
          studyRef={submissionId ? { kind: "submission", id: submissionId } : null}
          title={info?.topic ?? t("이 과제")}
          lockedReason={
            loadingCount > 0
              ? t("결과물이 완성되면 쓸 수 있어요.")
              : user
                ? t("저장된 결과물이 있어야 쓸 수 있어요.")
                : t("로그인하면 결과물이 저장되고, 요약·퀴즈·시험·채팅을 쓸 수 있어요.")
          }
        />
      </div>

      {modal}
    </div>
  );
}
