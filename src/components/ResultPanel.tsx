"use client";

import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CircleCheck, CircleHelp, CircleX, Link2, MessageSquareQuote, PencilLine, TriangleAlert } from "lucide-react";
import type { EssayResult, PlanResult, SourceRef } from "@/types/task";
import { SOURCE_TIER_LABEL } from "@/lib/links/source-quality";
import Button from "@/components/ui/Button";
import { ClaimCheckNote, MD_COMPONENTS, ProductionNotes } from "@/components/result/ResultExtras";

// 결과 카드 위쪽의 경고 배너. 조용히 최종본인 척 내보내지 않고 정직하게 알리기 위한 것들이다.
//  - caution: 검증이 안 됐거나 기준에 못 미침(출처 없음·분량·필수 항목)
//  - danger: 확인된 오류(저자가 다르게 확인됨)
function Notice({ tone = "caution", title, children }: { tone?: "caution" | "danger"; title: string; children?: ReactNode }) {
  return (
    <div
      role="note"
      className={[
        "mb-4 flex gap-3 rounded-2xl px-4 py-3.5",
        tone === "danger" ? "bg-danger/10" : "bg-background",
      ].join(" ")}
    >
      <TriangleAlert size={17} strokeWidth={1.7} className={["mt-0.5 shrink-0", tone === "danger" ? "text-danger" : "text-muted"].join(" ")} />
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug">{title}</p>
        {children && <p className="mt-1 text-xs leading-relaxed text-muted">{children}</p>}
      </div>
    </div>
  );
}

// N6/N8: 검색 출처가 하나도 없으면 카드 맨 위에 눈에 띄게 알린다. result.noSourcesWarning(서버가 계산)은 출처가 0개라는 것만이 아니라
// "애초에 검증이 필요한 사실 주장이 있었는지"까지 함께 확인된 값이다(순수 격려 편지 같은 글에는 뜨지 않는다).
function NoSourcesWarning() {
  return (
    <Notice title="이 내용은 검색으로 검증되지 않았어요">
      책 제목·저자·인용구 같은 구체적 사실이 있다면, 실제로 존재하는 내용인지 직접 검색해서 확인한 뒤 제출하세요.
    </Notice>
  );
}

// 분량 기준(예: "800자 내외")을 재시도까지 거치고도 못 맞췄을 때만 뜬다.
function LengthWarning({ message }: { message: string }) {
  return <Notice title={message} />;
}

// 책 저자를 검색으로 대조했는데 실제로 다른 저자로 확인된 경우(재시도 후에도 못 고쳤을 때)만 뜬다 — 단순한 "출처 없음"보다 확실한 오류라 구분한다.
function AuthorWarning({ message }: { message: string }) {
  return (
    <Notice tone="danger" title={message}>
      제출 전에 직접 검색해서 저자를 확인해 주세요.
    </Notice>
  );
}

// 안내문의 필수 항목이 재시도 후에도 비어 있거나, 조사에서 확정한 사실과 연도가 어긋날 때만 뜬다.
function StructureWarning({ message }: { message: string }) {
  return <Notice title={message} />;
}

function SourceList({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mt-8 border-t border-border pt-5">
      <h4 className="mb-1 text-sm font-bold">출처</h4>
      <p className="mb-3 text-xs leading-relaxed text-muted">
        “연결 확인됨”은 주소가 열린다는 뜻일 뿐, 그 페이지가 문장의 내용을 뒷받침한다는 뜻은 아니에요. 중요한 사실은 링크를 열어 직접 확인하세요.
      </p>
      <ol className="space-y-2 text-sm">
        {sources.map((s) => {
          const status =
            s.url_valid === false
              ? { icon: CircleX, label: "없는 페이지", cls: "text-danger" }
              : s.url_valid
                ? { icon: CircleCheck, label: "연결 확인됨", cls: "text-muted" }
                : { icon: CircleHelp, label: "자동 확인 불가 — 직접 열어 보세요", cls: "text-muted" };
          const Icon = status.icon;
          return (
            <li key={s.n} className="flex gap-2.5">
              <span className="w-6 shrink-0 text-right tabular-nums text-faint">[{s.n}]</span>
              <div className="min-w-0">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="break-all underline underline-offset-2 hover:text-muted">
                  {s.title}
                </a>
                <p className={["mt-0.5 flex flex-wrap items-center gap-x-2 text-xs", status.cls].join(" ")}>
                  <span className="inline-flex items-center gap-1">
                    <Icon size={12} strokeWidth={1.8} />
                    {status.label}
                  </span>
                  {s.tier && <span className="text-faint">{SOURCE_TIER_LABEL[s.tier]}</span>}
                </p>
              </div>
            </li>
          );
        })}
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
      <div className="mt-6 border-t border-border pt-4">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
        >
          <PencilLine size={14} strokeWidth={1.7} />
          마음에 안 들어요, 수정 요청하기 (하루 1회)
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3 border-t border-border pt-4">
      <label htmlFor="regen-text" className="block text-[13px] font-semibold">
        어떤 방향으로 고치고 싶은지 적어 주세요
      </label>
      <textarea
        id="regen-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="예: 좀 더 개인적인 경험을 넣어서, 문체를 더 편하게"
        className="w-full rounded-xl border border-border-strong bg-background px-4 py-3 text-sm placeholder:text-faint focus:border-foreground"
      />
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={!text.trim() || loading}
          onClick={async () => {
            setLoading(true);
            setError(null);
            try {
              await onRegenerate(text);
              setOpen(false);
              setText("");
            } catch (err) {
              setError(err instanceof Error ? err.message : "다시 만들지 못했어요.");
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? "다시 만드는 중..." : "다시 만들기"}
        </Button>
        <Button size="sm" onClick={() => setOpen(false)} disabled={loading}>
          취소
        </Button>
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
      if (!res.ok) throw new Error((await res.json()).error ?? "공유 링크를 만들지 못했어요.");
      const { shareToken } = (await res.json()) as { shareToken: string };
      await navigator.clipboard.writeText(`${window.location.origin}/share/${shareToken}`);
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } catch (err) {
      setState("error");
      setErrorMessage(err instanceof Error ? err.message : "공유 링크를 만들지 못했어요.");
    }
  }

  return (
    <div className="mt-4">
      <button
        onClick={handleShare}
        disabled={state === "loading"}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-foreground disabled:opacity-40"
      >
        <Link2 size={14} strokeWidth={1.7} />
        {state === "loading" ? "링크 만드는 중..." : state === "copied" ? "링크를 복사했어요 (로그인 없이 읽을 수 있어요)" : "읽기 링크 복사"}
      </button>
      {state === "error" && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {errorMessage}
        </p>
      )}
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
      if (!res.ok) throw new Error((await res.json()).error ?? "예상 질문을 만들지 못했어요.");
      setQuestions((await res.json()).questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "예상 질문을 만들지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-4">
        <button
          onClick={handleOpen}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
        >
          <MessageSquareQuote size={14} strokeWidth={1.7} />
          발표 후 받을 만한 예상 질문 보기
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-background p-4">
      <p className="mb-2 text-xs font-semibold text-faint">예상 질문</p>
      {loading && (
        <p role="status" className="text-sm text-muted">
          예상 질문을 만드는 중이에요...
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {questions && (
        <ul className="space-y-2 text-sm leading-relaxed">
          {questions.map((q, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" aria-hidden />
              {q}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ARTICLE =
  "prose prose-sm max-w-none prose-neutral dark:prose-invert prose-headings:tracking-tight prose-h2:mt-0 prose-h2:text-lg prose-h3:text-[15px] prose-p:leading-[1.85] prose-li:leading-[1.8] prose-a:underline";

export function EssayPanel({
  label,
  result,
  onRegenerate,
  topic,
  showExpectedQuestions,
  hideHeading = false,
}: {
  label: string;
  result: EssayResult;
  onRegenerate?: (revisionInstructions: string) => Promise<void>;
  /** 9-3용. topic이 있고 showExpectedQuestions가 true일 때만 버튼이 뜬다. */
  topic?: string;
  showExpectedQuestions?: boolean;
  /** 화면 제목이 이미 따로 있을 때(결과물 상세) 카드 안 제목을 숨긴다. */
  hideHeading?: boolean;
}) {
  return (
    <section className="rounded-3xl bg-surface p-6 md:p-10">
      {!hideHeading && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-faint">완성 원고</p>
          <h3 className="mt-1 text-lg font-bold tracking-tight">{label}</h3>
        </div>
      )}
      {result.noSourcesWarning && <NoSourcesWarning />}
      {result.authorWarning && <AuthorWarning message={result.authorWarning} />}
      {result.lengthWarning && <LengthWarning message={result.lengthWarning} />}
      {result.structureWarning && <StructureWarning message={result.structureWarning} />}
      <article className={ARTICLE}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
          {result.markdown}
        </ReactMarkdown>
      </article>
      <ProductionNotes
        notes={[
          ...(result.productionNotes ? [{ text: result.productionNotes }] : []),
          ...(result.sections ?? []).flatMap((x) => (x.productionNotes ? [{ label: x.label, text: x.productionNotes }] : [])),
        ]}
      />
      <ClaimCheckNote
        checks={[...(result.claimCheck ? [result.claimCheck] : []), ...(result.sections ?? []).flatMap((x) => (x.claimCheck ? [x.claimCheck] : []))]}
      />
      <SourceList sources={result.sources} />
      {result.submissionId && onRegenerate && <RegenerateBox onRegenerate={onRegenerate} />}
      {result.submissionId && <ShareButton submissionId={result.submissionId} />}
      {showExpectedQuestions && topic && <ExpectedQuestionsBox topic={topic} resultText={result.markdown} />}
    </section>
  );
}

export function PlanPanel({
  label,
  result,
  onRegenerate,
  topic,
  showExpectedQuestions,
  hideHeading = false,
}: {
  label: string;
  result: PlanResult;
  onRegenerate?: (revisionInstructions: string) => Promise<void>;
  topic?: string;
  showExpectedQuestions?: boolean;
  /** 화면 제목이 이미 따로 있을 때(결과물 상세) 카드 안 제목을 숨긴다. */
  hideHeading?: boolean;
}) {
  return (
    <section className="rounded-3xl bg-surface p-6 md:p-10">
      {!hideHeading && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-faint">완성된 글</p>
          <h3 className="mt-1 text-lg font-bold tracking-tight">{label}</h3>
        </div>
      )}
      {result.sources.length === 0 && <NoSourcesWarning />}
      {result.structureWarning && <StructureWarning message={result.structureWarning} />}
      {result.factConsistencyWarning && <StructureWarning message={result.factConsistencyWarning} />}
      <article className={ARTICLE}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.content}</ReactMarkdown>
      </article>
      <SourceList sources={result.sources} />
      {result.productionSteps.length > 0 && (
        <div className="mt-8 border-t border-border pt-5">
          <h4 className="mb-3 text-sm font-bold">위 글 외에 직접 만들어야 하는 부분</h4>
          <ol className="space-y-2">
            {[...result.productionSteps]
              .sort((a, b) => a.order - b.order)
              .map((step) => (
                <li key={step.order} className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3">
                  <p className="text-sm leading-relaxed">
                    <span className="mr-2 tabular-nums text-faint">{step.order}</span>
                    {step.task}
                  </p>
                  <span className="shrink-0 text-xs text-muted">약 {step.estimated_minutes}분</span>
                </li>
              ))}
          </ol>
        </div>
      )}
      {result.submissionId && onRegenerate && <RegenerateBox onRegenerate={onRegenerate} />}
      {result.submissionId && <ShareButton submissionId={result.submissionId} />}
      {showExpectedQuestions && topic && <ExpectedQuestionsBox topic={topic} resultText={result.content} />}
    </section>
  );
}
