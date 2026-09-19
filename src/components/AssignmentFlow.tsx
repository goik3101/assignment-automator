"use client";

import { useEffect, useState } from "react";
import type {
  AdministrativeInfo,
  AnalyzeResult,
  CoreTaskInfo,
  EssayResult,
  InsufficientDataResult,
  PlanResult,
  TaskElement,
} from "@/types/task";
import { EssayPanel, PlanPanel } from "./ResultPanel";
import Turnstile from "./Turnstile";
import HomeDashboard from "./HomeDashboard";
import { useAuth } from "@/lib/supabase/use-auth";
import { isPresentationTask } from "@/lib/util/presentation";

interface LatestHistory {
  subject: string;
  core_task_info: CoreTaskInfo;
  admin_info: AdministrativeInfo | null;
  instructions: string | null;
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

// 매번 같은 예시 하나만 보여주면 학생들이 실제로 쓸 수 있는 지침의 폭을 잘
// 못 느낀다 — 새로고침하거나 "새 수행평가 시작하기"를 누를 때마다 이 중
// 하나를 무작위로 보여준다(고정 문구 대신 로테이션).
const INSTRUCTION_PLACEHOLDER_EXAMPLES = [
  "예: 발표는 5분 내외로, 개인적인 경험을 넣어서",
  "예: 친구 이름은 [이름]으로 표시해줘",
  "예: 형식은 편지가 아니라 대화체로 써줘",
  "예: 너무 무거운 톤 말고 담백하게 써줘",
];

function randomInstructionPlaceholder(): string {
  return INSTRUCTION_PLACEHOLDER_EXAMPLES[Math.floor(Math.random() * INSTRUCTION_PLACEHOLDER_EXAMPLES.length)];
}

type Step = "input" | "analyzing" | "confirm" | "result";

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

function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [, data] = result.split(",");
      resolve({ data, mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AssignmentFlow() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("input");
  // 홈 대시보드에서 + 를 눌렀을 때 뜨는 새 수행평가 입력 모달(Figma). 입력 상태/핸들러는 그대로다.
  const [showNew, setShowNew] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // 입력 단계
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [topicText, setTopicText] = useState("");
  const [instructions, setInstructions] = useState("");
  // 서버 렌더링과 클라이언트 첫 렌더링이 똑같은 값을 내야 hydration mismatch가
  // 안 난다 — useState(랜덤값)으로 즉시 무작위를 뽑으면 SSR과 클라이언트가
  // 서로 다른 값을 뽑아버려서(Math.random()이 서버/클라이언트에서 각각
  // 따로 평가됨) React가 hydration 에러를 낸다(실제로 콘솔에서 확인됨).
  // 그래서 초기값은 고정된 첫 예시로 두고, 마운트 후(useEffect, 클라이언트
  // 에서만 실행됨)에만 무작위로 바꾼다.
  const [instructionPlaceholder, setInstructionPlaceholder] = useState(INSTRUCTION_PLACEHOLDER_EXAMPLES[0]);
  useEffect(() => {
    // 마운트 시점에 한 번만, 클라이언트에서만 실행되는 의도된 동기화다(SSR
    // 값과 다르게 만드는 게 목적) — 일반적으로 경계하는 "effect 안 setState로
    // 인한 연쇄 렌더링" 문제와는 다른, hydration-safe 랜덤화의 표준 패턴이다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInstructionPlaceholder(randomInstructionPlaceholder());
  }, []);

  // 확인 폼 단계 (F3) — analyze 결과를 편집 가능한 상태로 보관
  const [subject, setSubject] = useState("");
  const [coreTaskInfo, setCoreTaskInfo] = useState<CoreTaskInfo | null>(null);
  const [adminInfo, setAdminInfo] = useState<AnalyzeResult["administrative_info"] | null>(null);

  // 결과 단계
  const [items, setItems] = useState<GeneratedItem[]>([]);
  // 완성 원고 결과의 상단 3줄 요약 — 여러 단계여도 전체를 아우르는 하나의
  // 요약이라 요소별 카드 안이 아니라 카드들 위에 한 번만 보여준다.
  const [essaySummaryLines, setEssaySummaryLines] = useState<string[]>([]);

  // 최근 히스토리 다시 불러오기 (로그인 사용자에게만 노출)
  const [latestHistory, setLatestHistory] = useState<LatestHistory | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch("/api/histories/latest")
      .then((res) => res.json())
      .then((data) => setLatestHistory(data))
      .catch(() => setLatestHistory(null));
  }, [user]);

  function handleUseLatest() {
    if (!user || !latestHistory) return;
    setSubject(latestHistory.subject);
    setCoreTaskInfo(latestHistory.core_task_info);
    setAdminInfo(latestHistory.admin_info);
    setInstructions(latestHistory.instructions ?? "");
    setStep("confirm");
  }

  async function handleAnalyze() {
    setErrorMessage(null);
    setStep("analyzing");
    try {
      let imageBase64: string | undefined;
      let imageMimeType: string | undefined;
      if (imageFile) {
        const encoded = await fileToBase64(imageFile);
        imageBase64 = encoded.data;
        imageMimeType = encoded.mimeType;
      }

      const res = await fetch("/api/tasks/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, imageMimeType, topicText, instructions }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "분석에 실패했습니다.");

      const result: AnalyzeResult = await res.json();
      if (result.insufficient_data) {
        setErrorMessage(
          result.insufficient_reason ??
            "안내문에서 충분한 정보를 읽어내지 못했어요. 사진을 다시 찍거나 주제를 직접 입력해주세요."
        );
        setStep("input");
        setShowNew(true);
        return;
      }

      setSubject(result.subject);
      setAdminInfo(result.administrative_info);
      setCoreTaskInfo(result.core_task_info);
      setStep("confirm");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "분석 중 오류가 발생했습니다.");
      setStep("input");
        setShowNew(true);
    }
  }

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
        message: err instanceof Error ? err.message : "생성 중 오류가 발생했습니다.",
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
  // fixedSubject: 같은 과제의 완성 원고(text_submission)가 먼저 생성되어
  // 인물/사건 등을 확정했다면 그 값 — 신문 제작 등이 다른 대상을 새로
  // 선정해버리는 인물 혼입을 막기 위해 그대로 넘겨 고정시킨다.
  // referenceFactsText: 위 완성 원고의 전체 텍스트 — 출생/사망 연도 같은
  // 구체적 사실이 essay와 plan에서 서로 다르게 나오는(둘이 독립된 검색
  // 그라운딩 호출이라 생길 수 있는) 문제를 막기 위해 그대로 전달한다.
  async function generatePlanElements(
    planElements: TextStageRef[],
    fixedSubject?: string,
    referenceFactsText?: string
  ) {
    await Promise.all(
      planElements.map(async ({ element, idx }) => {
        try {
          const res = await fetch("/api/tasks/generate/plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subject,
              coreTaskInfo,
              adminInfo,
              instructions,
              turnstileToken,
              fixedSubject,
              referenceFactsText,
            }),
          });
          if (!res.ok) throw new Error((await res.json()).error ?? "생성에 실패했습니다.");
          const result: EssayResult | PlanResult | InsufficientDataResult = await res.json();
          if (result.type === "insufficient_data") setItemInsufficient(idx, element, result.reason);
          else setItemDone(idx, element, result);
        } catch (err) {
          setItemError(idx, element, err);
        }
      })
    );
  }

  // 완성 원고로 제출 가능한 요소(고민쓰기→친구의 고민 분석→책처방전→편지처럼
  // 이어지는 서술형)를 전부 한 번의 호출로 생성한다 — 같은 컨텍스트 안에서 한
  // 번에 쓰기 때문에, 등장인물 이름·책 정보 같은 사실이 요소 사이에서 어긋날
  // 수가 구조적으로 없다 (여러 번 나눠 부르면 서로의 확정된 사실을 몰라서
  // 매번 다르게 지어내는 문제가 있었다 — PROGRESS.md 참고). "이번 과제 한정
  // 지침" 필드에 학생이 입력한 내용(예: 무작위로 뽑은 친구의 실제 고민 원문)도
  // 이 한 번의 호출에 그대로 실려서 반영된다.
  // 반환값: 이 과제가 인물/사건 등을 자유롭게 선정한 유형이면 그 대상 이름
  // (EssayResult.confirmedSubject)과 전체 텍스트(markdown) — 같은 과제에
  // external_production 요소도 있으면 handleGenerate()가 이 값을 그대로
  // generatePlanElements에 넘겨서, 두 종류가 서로 다른 대상을 골라버리는
  // 인물 혼입이나 서로 다른 사실(날짜·숫자 등)을 내놓는 문제를 막는다.
  async function generateTextElements(
    textStages: TextStageRef[]
  ): Promise<{ confirmedSubject?: string; markdown?: string } | undefined> {
    try {
      const res = await fetch("/api/tasks/generate/essay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, coreTaskInfo, adminInfo, instructions, turnstileToken }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "생성에 실패했습니다.");
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
            latency_ms: result.latency_ms,
            submissionId: result.submissionId,
          });
        });
      } else {
        // 요소가 하나뿐이거나(섹션 분리 불필요) 어떤 이유로든 개수가 안 맞으면,
        // 전체 결과를 첫 요소에 그대로 보여준다.
        const [first, ...rest] = textStages;
        setItemDone(first.idx, first.element, result);
        for (const { element, idx } of rest) {
          setItemError(idx, element, new Error("이 단계는 별도로 표시되지 않았어요 — 위 결과를 확인해주세요."));
        }
      }
      return { confirmedSubject: result.confirmedSubject, markdown: result.markdown };
    } catch (err) {
      for (const { element, idx } of textStages) setItemError(idx, element, err);
      return undefined;
    }
  }

  async function handleGenerate() {
    if (!coreTaskInfo) return;
    setErrorMessage(null);
    const initial: GeneratedItem[] = coreTaskInfo.task_elements.map((element) => ({
      element,
      status: "loading",
    }));
    setItems(initial);
    setEssaySummaryLines([]);
    setStep("result");

    const withIndex = coreTaskInfo.task_elements.map((element, idx) => ({ element, idx }));
    const textStages = withIndex.filter(({ element }) => element.type === "text_submission");
    const planElements = withIndex.filter(({ element }) => element.type === "external_production");

    if (textStages.length > 0 && planElements.length > 0) {
      // 완성 원고와 실행 계획이 함께 있는 과제는, 완성 원고 쪽이 인물/사건
      // 등을 자유롭게 선정할 수 있다 — 두 호출이 병렬로 각자 다른 대상을
      // 골라버리는 인물 혼입을 막기 위해, 원고를 먼저 생성해 확정된 대상을
      // 실행 계획 생성에 그대로 넘긴다(순서상 조금 느려지지만 일관성이 우선).
      const essayOutcome = await generateTextElements(textStages);
      void generatePlanElements(planElements, essayOutcome?.confirmedSubject, essayOutcome?.markdown);
    } else {
      void generatePlanElements(planElements);
      if (textStages.length > 0) void generateTextElements(textStages);
    }
  }

  async function handleRegenerate(idx: number, revisionInstructions: string) {
    const item = items[idx];
    if (item.status !== "done") return;
    const submissionId = item.result.submissionId;
    if (!submissionId) throw new Error("로그인 후 이용할 수 있어요.");

    const res = await fetch(`/api/tasks/${submissionId}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revisionInstructions }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? "재생성에 실패했습니다.");

    const result: EssayResult | PlanResult | InsufficientDataResult = await res.json();
    if (result.type === "insufficient_data") {
      throw new Error(result.reason || "자료가 부족해 재생성이 어려웠어요.");
    }

    // 완성 원고는 요소 여러 개가 한 번에 재생성되므로(같은 submissionId를 공유),
    // 이 결과를 클릭한 패널 하나가 아니라 완성 원고 요소 전체에 다시 나눠 반영한다.
    if (result.type === "essay" && result.sections && coreTaskInfo) {
      setEssaySummaryLines(result.summaryLines ?? []);
      const textStages = coreTaskInfo.task_elements
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
            latency_ms: result.latency_ms,
            submissionId: result.submissionId,
          });
        });
        return;
      }
    }

    setItemDone(idx, item.element, result);
  }

  function updateElement(index: number, patch: Partial<TaskElement>) {
    if (!coreTaskInfo) return;
    const next = [...coreTaskInfo.task_elements];
    next[index] = { ...next[index], ...patch };
    setCoreTaskInfo({ ...coreTaskInfo, task_elements: next });
  }

  return (
    <div className={step === "input" ? "w-full px-6 py-6 md:px-8" : "mx-auto w-full max-w-2xl px-6 py-12"}>
      {step !== "input" && (
        <header className="mb-8">
          <h1 className="text-[22px] font-bold tracking-tight">새 수행평가</h1>
          <p className="mt-1 text-sm text-muted">겹치지 않는, 출처 있는 수행평가 도우미</p>
        </header>
      )}

      {errorMessage && !(step === "input" && showNew) && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {step === "input" && (
        <>
          <HomeDashboard onNew={() => setShowNew(true)} />
          {showNew && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setShowNew(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="새 수행평가"
                className="relative max-h-[92vh] w-full max-w-[640px] overflow-y-auto rounded-2xl border border-border bg-surface px-8 py-7 shadow-2xl"
              >
                <button
                  onClick={() => setShowNew(false)}
                  aria-label="닫기"
                  className="absolute right-4 top-4 rounded-md p-1 text-foreground/70 hover:text-foreground"
                >
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                    <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
                <div className="flex flex-col items-center gap-5">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold">사진 넣기</h2>
                      {user && latestHistory && (
                        <button
                          onClick={handleUseLatest}
                          className="text-xs text-muted underline underline-offset-2 hover:text-foreground"
                        >
                          최근 불러오기
                        </button>
                      )}
                    </div>
                    <label className="flex h-[235px] w-[185px] cursor-pointer items-center justify-center border border-dashed border-foreground/70 transition-opacity hover:opacity-70">
                      {imagePreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imagePreview} alt="업로드한 안내문 미리보기" className="max-h-full max-w-full object-contain" />
                      ) : (
                        <svg viewBox="0 0 20 20" fill="none" className="h-14 w-14">
                          <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
                        </svg>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          setImageFile(file);
                          setImagePreview(file ? URL.createObjectURL(file) : null);
                        }}
                      />
                    </label>
                  </div>

                  <div className="w-full">
                    <div className="mb-2 flex items-center justify-center gap-3">
                      <label htmlFor="topic-text" className="block text-xl font-bold">
                        사진 넣기 또는 주제 설명
                      </label>
                      {topicText.length > 0 && <span className="text-xs text-muted">{topicText.length}자</span>}
                    </div>
                    <input
                      id="topic-text"
                      type="text"
                      value={topicText}
                      onChange={(e) => setTopicText(e.target.value)}
                      placeholder="예: 어린 왕자 독서감상문"
                      className="w-full rounded-full border border-foreground/50 bg-transparent px-5 py-2 text-sm"
                    />
                  </div>

                  <div className="w-full">
                    <label htmlFor="instructions-text" className="mb-2 block text-center text-xl font-bold">
                      상세 입력 <span className="text-sm font-normal text-muted">(선택)</span>
                    </label>
                    <textarea
                      id="instructions-text"
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder={instructionPlaceholder}
                      rows={3}
                      className="w-full rounded-2xl border border-foreground/50 bg-transparent px-5 py-3 text-sm"
                    />
                  </div>

                  {errorMessage && (
                    <p role="alert" className="w-full rounded-xl border border-red-500/60 px-4 py-2 text-sm text-red-500">
                      {errorMessage}
                    </p>
                  )}

                  <button
                    onClick={handleAnalyze}
                    disabled={!imageFile && !topicText.trim()}
                    className="rounded-full bg-accent px-12 py-2.5 text-sm font-bold text-accent-foreground disabled:opacity-40"
                  >
                    분석하기
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {step === "analyzing" && (
        <div className="py-16 text-center text-sm text-muted">안내문을 분석하고 있어요...</div>
      )}

      {step === "confirm" && coreTaskInfo && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs text-muted mb-1">과목</p>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-full border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs text-muted mb-1">주제</p>
            <input
              value={coreTaskInfo.topic}
              onChange={(e) => setCoreTaskInfo({ ...coreTaskInfo, topic: e.target.value })}
              className="w-full rounded-full border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs text-muted mb-2">요구사항</p>
            <textarea
              value={coreTaskInfo.requirements.join("\n")}
              onChange={(e) =>
                setCoreTaskInfo({
                  ...coreTaskInfo,
                  requirements: e.target.value.split("\n").filter(Boolean),
                })
              }
              rows={4}
              className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-muted">한 줄에 하나씩</p>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-muted">산출물 요소</p>
            {coreTaskInfo.task_elements.map((el, idx) => (
              <div key={idx} className="rounded-2xl border border-border bg-surface p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={el.type}
                    onChange={(e) => updateElement(idx, { type: e.target.value as TaskElement["type"] })}
                    className="rounded-full border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="text_submission">완성 원고로 제출 가능</option>
                    <option value="external_production">외부 툴로 별도 제작 필요</option>
                  </select>
                  <input
                    value={el.label}
                    onChange={(e) => updateElement(idx, { label: e.target.value })}
                    className="flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-sm"
                  />
                </div>
                <textarea
                  value={el.description}
                  onChange={(e) => updateElement(idx, { description: e.target.value })}
                  rows={2}
                  className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-xs"
                />
                {el.required_items && el.required_items.length > 0 && (
                  <p className="text-xs text-muted">
                    안내문에서 찾은 필수 항목 (
                    {el.items_format === "sections" ? "항목별로 나눠서 작성" : "글 안에서 빠짐없이 다룸"}):{" "}
                    {el.required_items.join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>

          {adminInfo && (adminInfo.due_date || adminInfo.submission_method || adminInfo.grading_criteria) && (
            <div className="rounded-2xl border border-border bg-surface p-4 text-xs text-muted space-y-1">
              <p className="font-medium text-foreground">행정정보 (참고용)</p>
              {adminInfo.due_date && <p>제출기한: {adminInfo.due_date}</p>}
              {adminInfo.submission_method && <p>제출방법: {adminInfo.submission_method}</p>}
              {adminInfo.grading_criteria && <p>채점기준: {adminInfo.grading_criteria}</p>}
            </div>
          )}

          {!user && (
            <div>
              {TURNSTILE_SITE_KEY && (
                <Turnstile siteKey={TURNSTILE_SITE_KEY} onToken={setTurnstileToken} />
              )}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={(!user && !!TURNSTILE_SITE_KEY && !turnstileToken) || !subject.trim()}
            className="w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-40"
          >
            이 내용으로 생성하기
          </button>
          {!subject.trim() && (
            <p className="text-xs text-red-600">위 &ldquo;과목&rdquo; 칸을 채워주세요 — 비어 있으면 생성할 수 없어요.</p>
          )}
        </div>
      )}

      {step === "result" && (
        <div className="space-y-6">
          {essaySummaryLines.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="mb-2 text-xs font-medium text-muted">전체 요약</p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {essaySummaryLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {items.map((item, idx) => {
            if (item.status === "loading") {
              return (
                <div key={idx} className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
                  {item.element.label} 생성 중...
                </div>
              );
            }
            if (item.status === "error") {
              return (
                <div key={idx} className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                  {item.element.label}: {item.message}
                </div>
              );
            }
            if (item.status === "insufficient") {
              return (
                <div key={idx} className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                  {item.element.label}: 자료가 부족해 정확한 생성이 어려웠어요. ({item.reason})
                </div>
              );
            }
            const showQuestions = coreTaskInfo ? isPresentationTask(coreTaskInfo) : false;
            return item.result.type === "essay" ? (
              <EssayPanel
                key={idx}
                label={item.element.label}
                result={item.result}
                onRegenerate={(text) => handleRegenerate(idx, text)}
                topic={coreTaskInfo?.topic}
                showExpectedQuestions={showQuestions}
              />
            ) : (
              <PlanPanel
                key={idx}
                label={item.element.label}
                result={item.result}
                onRegenerate={(text) => handleRegenerate(idx, text)}
                topic={coreTaskInfo?.topic}
                showExpectedQuestions={showQuestions}
              />
            );
          })}

          <button
            onClick={() => {
              setStep("input");
              setShowNew(true);
              setImageFile(null);
              setImagePreview(null);
              setTopicText("");
              setInstructions("");
              setInstructionPlaceholder(randomInstructionPlaceholder());
              setCoreTaskInfo(null);
              setItems([]);
              setEssaySummaryLines([]);
            }}
            className="w-full rounded-full border border-border px-4 py-2.5 text-sm font-medium"
          >
            새 수행평가 시작하기
          </button>
        </div>
      )}
    </div>
  );
}
