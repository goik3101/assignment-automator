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
import OnboardingChecklist from "./OnboardingChecklist";
import { Logo } from "./Logo";
import { useAuth } from "@/lib/supabase/use-auth";
import { isPresentationTask } from "@/lib/util/presentation";

interface LatestHistory {
  subject: string;
  core_task_info: CoreTaskInfo;
  admin_info: AdministrativeInfo | null;
  instructions: string | null;
}

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type Step = "input" | "analyzing" | "confirm" | "generating" | "result";

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // 입력 단계
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [topicText, setTopicText] = useState("");
  const [instructions, setInstructions] = useState("");

  // 확인 폼 단계 (F3) — analyze 결과를 편집 가능한 상태로 보관
  const [subject, setSubject] = useState("");
  const [coreTaskInfo, setCoreTaskInfo] = useState<CoreTaskInfo | null>(null);
  const [adminInfo, setAdminInfo] = useState<AnalyzeResult["administrative_info"] | null>(null);

  // 결과 단계
  const [items, setItems] = useState<GeneratedItem[]>([]);

  // 최근 히스토리 다시 불러오기 (로그인 사용자에게만 노출)
  const [latestHistory, setLatestHistory] = useState<LatestHistory | null>(null);

  useEffect(() => {
    if (!user) {
      setLatestHistory(null);
      return;
    }
    fetch("/api/histories/latest")
      .then((res) => res.json())
      .then((data) => setLatestHistory(data))
      .catch(() => setLatestHistory(null));
  }, [user]);

  function handleUseLatest() {
    if (!latestHistory) return;
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
        return;
      }

      setSubject(result.subject);
      setAdminInfo(result.administrative_info);
      setCoreTaskInfo(result.core_task_info);
      setStep("confirm");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "분석 중 오류가 발생했습니다.");
      setStep("input");
    }
  }

  async function handleGenerate() {
    if (!coreTaskInfo) return;
    setErrorMessage(null);
    setStep("generating");
    const initial: GeneratedItem[] = coreTaskInfo.task_elements.map((element) => ({
      element,
      status: "loading",
    }));
    setItems(initial);

    await Promise.all(
      coreTaskInfo.task_elements.map(async (element, idx) => {
        const endpoint =
          element.type === "text_submission" ? "/api/tasks/generate/essay" : "/api/tasks/generate/plan";
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject, coreTaskInfo, adminInfo, instructions, turnstileToken }),
          });
          if (!res.ok) throw new Error((await res.json()).error ?? "생성에 실패했습니다.");
          const result: EssayResult | PlanResult | InsufficientDataResult = await res.json();

          setItems((prev) => {
            const next = [...prev];
            next[idx] =
              result.type === "insufficient_data"
                ? { element, status: "insufficient", reason: result.reason }
                : { element, status: "done", result };
            return next;
          });
        } catch (err) {
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
      })
    );

    setStep("result");
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

    setItems((prev) => {
      const next = [...prev];
      next[idx] = { element: item.element, status: "done", result };
      return next;
    });
  }

  function updateElement(index: number, patch: Partial<TaskElement>) {
    if (!coreTaskInfo) return;
    const next = [...coreTaskInfo.task_elements];
    next[index] = { ...next[index], ...patch };
    setCoreTaskInfo({ ...coreTaskInfo, task_elements: next });
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <header className="mb-8">
        <p className="text-xs font-medium tracking-wide text-muted">AI 수행평가 도우미</p>
        <h1 className="mt-2">
          <Logo variant="wordmark" height={32} />
        </h1>
        <p className="mt-2 text-sm text-muted">겹치지 않는, 출처 있는 수행평가 도우미</p>
      </header>

      {errorMessage && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {step === "input" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface p-6 space-y-6">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-medium">수행평가 안내문 사진</label>
                {latestHistory && (
                  <button
                    onClick={handleUseLatest}
                    className="text-xs text-accent underline underline-offset-2 hover:no-underline"
                  >
                    최근 불러오기
                  </button>
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setImageFile(file);
                  setImagePreview(file ? URL.createObjectURL(file) : null);
                }}
                className="block w-full text-sm text-muted file:mr-4 file:rounded-md file:border-0 file:bg-accent file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent-foreground"
              />
              {imagePreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview} alt="업로드한 안내문 미리보기" className="mt-3 max-h-64 rounded-md border border-border" />
              )}
            </div>

            <div className="text-center text-xs text-muted">또는</div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-medium">주제 직접 입력</label>
                {topicText.length > 0 && (
                  <span className="text-xs text-muted">{topicText.length}자</span>
                )}
              </div>
              <input
                type="text"
                value={topicText}
                onChange={(e) => setTopicText(e.target.value)}
                placeholder="예: 어린 왕자 독서감상문"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">이번 과제 한정 지침 (선택)</label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="예: 발표는 5분 내외로, 개인적인 경험을 넣어서"
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!imageFile && !topicText.trim()}
              className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-40"
            >
              분석하기
            </button>
          </div>

          <OnboardingChecklist completed={[false, false, false]} />
        </div>
      )}

      {step === "analyzing" && (
        <div className="py-16 text-center text-sm text-muted">안내문을 분석하고 있어요...</div>
      )}

      {step === "confirm" && coreTaskInfo && (
        <div className="space-y-6">
          <div className="rounded-md border border-border bg-surface p-4">
            <p className="text-xs text-muted mb-1">과목</p>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-md border border-border bg-surface p-4">
            <p className="text-xs text-muted mb-1">주제</p>
            <input
              value={coreTaskInfo.topic}
              onChange={(e) => setCoreTaskInfo({ ...coreTaskInfo, topic: e.target.value })}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-md border border-border bg-surface p-4">
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
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-muted">한 줄에 하나씩</p>
          </div>

          <div className="space-y-3">
            <p className="text-xs text-muted">산출물 요소</p>
            {coreTaskInfo.task_elements.map((el, idx) => (
              <div key={idx} className="rounded-md border border-border bg-surface p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={el.type}
                    onChange={(e) => updateElement(idx, { type: e.target.value as TaskElement["type"] })}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="text_submission">완성 원고로 제출 가능</option>
                    <option value="external_production">외부 툴로 별도 제작 필요</option>
                  </select>
                  <input
                    value={el.label}
                    onChange={(e) => updateElement(idx, { label: e.target.value })}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  />
                </div>
                <textarea
                  value={el.description}
                  onChange={(e) => updateElement(idx, { description: e.target.value })}
                  rows={2}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs"
                />
              </div>
            ))}
          </div>

          {adminInfo && (adminInfo.due_date || adminInfo.submission_method || adminInfo.grading_criteria) && (
            <div className="rounded-md border border-border bg-surface p-4 text-xs text-muted space-y-1">
              <p className="font-medium text-foreground">행정정보 (참고용)</p>
              {adminInfo.due_date && <p>제출기한: {adminInfo.due_date}</p>}
              {adminInfo.submission_method && <p>제출방법: {adminInfo.submission_method}</p>}
              {adminInfo.grading_criteria && <p>채점기준: {adminInfo.grading_criteria}</p>}
            </div>
          )}

          {!user && (
            <div>
              <p className="mb-1 text-xs text-muted">
                비로그인 상태에서는 1회만 무료로 생성할 수 있어요.
              </p>
              {TURNSTILE_SITE_KEY && (
                <Turnstile siteKey={TURNSTILE_SITE_KEY} onToken={setTurnstileToken} />
              )}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={!user && !!TURNSTILE_SITE_KEY && !turnstileToken}
            className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-40"
          >
            이 내용으로 생성하기
          </button>
        </div>
      )}

      {step === "generating" && (
        <div className="py-16 text-center text-sm text-muted">
          검색하고 원고를 구성하는 중이에요... (완성 원고는 몇 초, 실행 계획은 조금 더 걸릴 수 있어요)
        </div>
      )}

      {step === "result" && (
        <div className="space-y-6">
          {items.map((item, idx) => {
            if (item.status === "loading") {
              return (
                <div key={idx} className="rounded-md border border-border bg-surface p-6 text-sm text-muted">
                  {item.element.label} 생성 중...
                </div>
              );
            }
            if (item.status === "error") {
              return (
                <div key={idx} className="rounded-md border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                  {item.element.label}: {item.message}
                </div>
              );
            }
            if (item.status === "insufficient") {
              return (
                <div key={idx} className="rounded-md border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
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
              setImageFile(null);
              setImagePreview(null);
              setTopicText("");
              setInstructions("");
              setCoreTaskInfo(null);
              setItems([]);
            }}
            className="w-full rounded-md border border-border px-4 py-2.5 text-sm font-medium"
          >
            새 수행평가 시작하기
          </button>
        </div>
      )}
    </div>
  );
}
