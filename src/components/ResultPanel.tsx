"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EssayResult, PlanResult, SourceRef } from "@/types/task";

function SourceList({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) {
    // N6/N8: 출처가 없으면 조용히 숨기지 말고 명확히 알린다 — 검색이 실패했거나
    // 이번 응답에서 모델이 그라운딩을 쓰지 않은 것일 수 있다.
    return (
      <div className="mt-6 border-t border-border pt-4">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          이번 생성에서는 검색 출처를 찾지 못했어요. 내용을 학생이 직접 한 번 더 확인해보는 걸 권해요.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-6 border-t border-border pt-4">
      <h4 className="text-sm font-medium text-muted mb-2">출처</h4>
      <ol className="space-y-1 text-sm">
        {sources.map((s) => (
          <li key={s.n} className="flex gap-2">
            <span className="text-muted">[{s.n}]</span>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-2 break-all"
            >
              {s.title}
            </a>
            <span
              className={
                s.url_valid === false
                  ? "text-red-600 text-xs whitespace-nowrap"
                  : "text-muted text-xs whitespace-nowrap"
              }
            >
              {s.url_valid === false ? "(연결 확인 안 됨)" : s.url_valid ? "(연결 확인됨)" : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// F6/9-5: 재생성 요청 UI. submissionId가 있는(=로그인 상태에서 저장된) 결과에만 붙는다.
function RegenerateBox({ onRegenerate }: { onRegenerate: (revisionInstructions: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-6 border-t border-border pt-4 text-xs text-muted underline underline-offset-2 hover:text-foreground"
      >
        결과가 마음에 안 드시나요? 수정 요청하기 (하루 1회)
      </button>
    );
  }

  return (
    <div className="mt-6 space-y-2 border-t border-border pt-4">
      <p className="text-xs text-muted">어떤 방향으로 고치고 싶은지 적어주세요.</p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="예: 좀 더 개인적인 경험을 넣어서, 문체를 더 편하게"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          onClick={async () => {
            setLoading(true);
            setError(null);
            try {
              await onRegenerate(text);
              setOpen(false);
              setText("");
            } catch (err) {
              setError(err instanceof Error ? err.message : "재생성에 실패했습니다.");
            } finally {
              setLoading(false);
            }
          }}
          disabled={!text.trim() || loading}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-40"
        >
          {loading ? "다시 만드는 중..." : "다시 만들기"}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={loading}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium"
        >
          취소
        </button>
      </div>
    </div>
  );
}

// 9-3: 예상 질문 생성 (구술·발표형 과제일 때만 조건부 노출). 로그인/횟수 제한 없음.
function ExpectedQuestionsBox({ topic, resultText }: { topic: string; resultText: string }) {
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    setOpen(true);
    if (questions || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks/expected-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, resultText }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "예상 질문 생성에 실패했습니다.");
      setQuestions((await res.json()).questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "예상 질문 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="mt-6 border-t border-border pt-4 text-xs text-muted underline underline-offset-2 hover:text-foreground"
      >
        발표 후 받을 만한 예상 질문 보기
      </button>
    );
  }

  return (
    <div className="mt-6 border-t border-border pt-4">
      {loading && <p className="text-xs text-muted">예상 질문을 만드는 중...</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {questions && (
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          {questions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EssayPanel({
  label,
  result,
  onRegenerate,
  topic,
  showExpectedQuestions,
}: {
  label: string;
  result: EssayResult;
  onRegenerate?: (revisionInstructions: string) => Promise<void>;
  /** 9-3용. topic이 있고 showExpectedQuestions가 true일 때만 버튼이 뜬다. */
  topic?: string;
  showExpectedQuestions?: boolean;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold">{label} — 완성 원고</h3>
      </div>
      <article className="prose prose-sm max-w-none prose-neutral dark:prose-invert">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.markdown}</ReactMarkdown>
      </article>
      <SourceList sources={result.sources} />
      {result.submissionId && onRegenerate && <RegenerateBox onRegenerate={onRegenerate} />}
      {showExpectedQuestions && topic && (
        <ExpectedQuestionsBox topic={topic} resultText={result.markdown} />
      )}
    </section>
  );
}

export function PlanPanel({
  label,
  result,
  onRegenerate,
  topic,
  showExpectedQuestions,
}: {
  label: string;
  result: PlanResult;
  onRegenerate?: (revisionInstructions: string) => Promise<void>;
  topic?: string;
  showExpectedQuestions?: boolean;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold">{label} — 실행 계획</h3>
      </div>
      <ol className="space-y-4">
        {result.steps
          .sort((a, b) => a.order - b.order)
          .map((step) => {
            const source = step.source_n ? result.sources.find((s) => s.n === step.source_n) : null;
            return (
              <li key={step.order} className="border border-border rounded-md p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">
                    {step.order}. {step.task}
                  </p>
                  <span className="text-xs text-muted whitespace-nowrap">약 {step.estimated_minutes}분</span>
                </div>
                {step.search_keywords.length > 0 && (
                  <p className="mt-2 text-sm text-muted">
                    검색어: {step.search_keywords.join(", ")}
                  </p>
                )}
                {source && (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm text-accent underline underline-offset-2 break-all"
                  >
                    참고 출처: {source.title}
                    {source.url_valid === false ? " (연결 확인 안 됨)" : ""}
                  </a>
                )}
              </li>
            );
          })}
      </ol>
      <SourceList sources={result.sources} />
      {result.submissionId && onRegenerate && <RegenerateBox onRegenerate={onRegenerate} />}
      {showExpectedQuestions && topic && (
        <ExpectedQuestionsBox
          topic={topic}
          resultText={result.steps.map((s) => s.task).join("\n")}
        />
      )}
    </section>
  );
}
