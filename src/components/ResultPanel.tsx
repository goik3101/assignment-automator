"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { EssayResult, PlanResult, SourceRef } from "@/types/task";
import { SOURCE_TIER_LABEL } from "@/lib/links/source-quality";

// N6/N8: 검색 출처가 하나도 없으면(그라운딩이 안 됐거나 모델이 검색을 안 쓴 경우)
// 하단에 작은 문구로 조용히 알리는 정도로는 눈에 잘 안 띈다 — 책 제목/저자/인용구처럼
// "실제로 존재하는지 검증이 꼭 필요한" 정보가 검증 안 된 채로 나올 수 있으니, 카드
// 맨 위에 눈에 띄게 강조해서 보여준다. result.noSourcesWarning(서버가 계산)은
// 출처가 0개라는 것만이 아니라 "애초에 검증이 필요한 사실 주장이 있었는지"까지
// 함께 확인된 값이다 — 실제로 발견된 버그: 책 언급·직접 인용·통계 등이 전혀
// 없는 순수 격려 편지 섹션에도 이 배너가 뜬 적이 있었다(검증할 대상 자체가
// 없으면 출처가 0개인 게 정상이라 경고할 이유가 없다).
function NoSourcesWarning() {
  return (
    <div className="mb-4 rounded-md border-2 border-amber-400 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
        ⚠ 이 내용은 검색으로 검증되지 않았어요
      </p>
      <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
        책 제목·저자·인용구 같은 구체적 사실이 있다면, 실제로 존재하는 내용인지 학생이
        직접 검색해서 확인한 뒤 제출하세요.
      </p>
    </div>
  );
}

// 분량 기준(예: "800자 내외")을 재시도까지 거치고도 못 맞췄을 때만 뜬다 —
// 조용히 기준 미달 상태를 최종본인 척 내보내지 않고 정직하게 알리기 위함.
function LengthWarning({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-md border-2 border-amber-400 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">⚠ {message}</p>
    </div>
  );
}

// 책 저자를 검색으로 대조했는데(단순히 출처가 없는 게 아니라, 실제로 다른
// 저자로 확인된 경우) 재시도 후에도 못 고쳤을 때만 뜬다 — NoSourcesWarning
// (출처 자체가 없음)이나 LengthWarning(분량 미달)보다 한 단계 더 확실한
// "확인된 오류"라서 빨간 톤으로 구분한다(실제 사례: 『내가 원하는 것을 나도
// 모를 때』를 "김나이"로 잘못 표기 — 각주는 붙어 있었는데도 저자가 틀렸음).
function AuthorWarning({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-md border-2 border-red-400 bg-red-50 px-4 py-3 dark:border-red-700 dark:bg-red-950">
      <p className="text-sm font-semibold text-red-900 dark:text-red-200">⚠ {message}</p>
      <p className="mt-1 text-xs text-red-800 dark:text-red-300">
        제출 전에 학생이 직접 검색해서 저자를 확인해주세요.
      </p>
    </div>
  );
}

// 안내문이 요구한 필수 항목이 재시도 후에도 비어 있거나(구조), 자료 수집에서 확정한
// 사실과 산출물의 연도가 어긋날 때(일관성)만 뜬다 — 조용히 최종본인 척 내보내지 않기 위함.
function StructureWarning({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-md border-2 border-amber-400 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950">
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">⚠ {message}</p>
    </div>
  );
}

function SourceList({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-6 border-t border-border pt-4">
      <h4 className="text-sm font-medium text-muted mb-1">출처</h4>
      <p className="mb-2 text-xs text-muted">
        &quot;연결 확인됨&quot;은 주소가 열린다는 뜻일 뿐, 그 페이지가 위 문장의 내용을 실제로 뒷받침한다는 뜻은
        아니에요. 중요한 사실은 링크를 열어 직접 확인하세요.
      </p>
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
            {s.tier && (
              <span className="text-muted text-xs whitespace-nowrap">· {SOURCE_TIER_LABEL[s.tier]}</span>
            )}
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
        className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm"
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
          className="rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-40"
        >
          {loading ? "다시 만드는 중..." : "다시 만들기"}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={loading}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium"
        >
          취소
        </button>
      </div>
    </div>
  );
}

// 결과 공유 링크. submissionId가 있는(=로그인 상태에서 저장된) 결과에만 붙는다.
// 클릭하면 공유 토큰을 발급받아(이미 있으면 재사용) 그 링크를 클립보드에 복사한다.
function ShareButton({ submissionId }: { submissionId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleShare() {
    setState("loading");
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/histories/${submissionId}/share`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "공유 링크 생성에 실패했습니다.");
      const { shareToken } = (await res.json()) as { shareToken: string };
      const url = `${window.location.origin}/share/${shareToken}`;
      await navigator.clipboard.writeText(url);
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } catch (err) {
      setState("error");
      setErrorMessage(err instanceof Error ? err.message : "공유 링크 생성에 실패했습니다.");
    }
  }

  return (
    <div className="mt-6 border-t border-border pt-4">
      <button
        onClick={handleShare}
        disabled={state === "loading"}
        className="text-xs text-muted underline underline-offset-2 hover:text-foreground disabled:opacity-40"
      >
        {state === "loading"
          ? "링크 만드는 중..."
          : state === "copied"
            ? "링크가 복사됐어요 (로그인 없이도 읽을 수 있어요)"
            : "링크 공유"}
      </button>
      {state === "error" && <p className="mt-1 text-xs text-red-600">{errorMessage}</p>}
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
    <section className="rounded-2xl border border-border bg-surface p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold">{label} — 완성 원고</h3>
      </div>
      {result.noSourcesWarning && <NoSourcesWarning />}
      {result.authorWarning && <AuthorWarning message={result.authorWarning} />}
      {result.lengthWarning && <LengthWarning message={result.lengthWarning} />}
      {result.structureWarning && <StructureWarning message={result.structureWarning} />}
      <article className="prose prose-sm max-w-none prose-neutral dark:prose-invert">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.markdown}</ReactMarkdown>
      </article>
      <SourceList sources={result.sources} />
      {result.submissionId && onRegenerate && <RegenerateBox onRegenerate={onRegenerate} />}
      {result.submissionId && <ShareButton submissionId={result.submissionId} />}
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
    <section className="rounded-2xl border border-border bg-surface p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold">{label} — 완성된 글</h3>
      </div>
      {result.sources.length === 0 && <NoSourcesWarning />}
      {result.structureWarning && <StructureWarning message={result.structureWarning} />}
      {result.factConsistencyWarning && <StructureWarning message={result.factConsistencyWarning} />}
      <article className="prose prose-sm max-w-none prose-neutral dark:prose-invert">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.content}</ReactMarkdown>
      </article>
      <SourceList sources={result.sources} />
      {result.productionSteps.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <p className="mb-3 text-xs font-medium text-muted">
            위 글 외에 학생이 직접 손으로 만들어야 하는 부분
          </p>
          <ol className="space-y-3">
            {result.productionSteps
              .sort((a, b) => a.order - b.order)
              .map((step) => (
                <li key={step.order} className="border border-border rounded-2xl p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">
                      {step.order}. {step.task}
                    </p>
                    <span className="text-xs text-muted whitespace-nowrap">약 {step.estimated_minutes}분</span>
                  </div>
                </li>
              ))}
          </ol>
        </div>
      )}
      {result.submissionId && onRegenerate && <RegenerateBox onRegenerate={onRegenerate} />}
      {result.submissionId && <ShareButton submissionId={result.submissionId} />}
      {showExpectedQuestions && topic && (
        <ExpectedQuestionsBox topic={topic} resultText={result.content} />
      )}
    </section>
  );
}
