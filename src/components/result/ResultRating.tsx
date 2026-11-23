"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useT } from "@/lib/i18n";

// 결과물 전체에 대한 "어땠나요?" 평가(품질·분량). 하단에 얇게 떠 있다가 결과를 읽은 뒤(스크롤 또는 잠시 뒤) 올라온다.
// 카드마다 반복하지 않고 결과 하나에 한 번만 묻는다. 본문·학생 입력은 보내지 않는다 — 칸 이름과 칸별 글자 수 같은 구조 정보만(api/results/rating, 마이그레이션 0022).
export interface RatingContext {
  kind: "essay" | "plan";
  steps: { label: string; chars: number }[];
  sources: number;
  latencyMs?: number;
  warnings: { noSources: boolean; length: boolean; structure: boolean };
}

const visibleChars = (md: string) => md.replace(/\[\d+(?:,\s*\d+)*\]/g, "").replace(/[#*_>|`-]/g, "").replace(/\s/g, "").length;

/** 카드 하나의 결과에서 구조 정보만 뽑는다(본문 제외). */
export function ratingContextFrom(
  kind: "essay" | "plan",
  label: string | undefined,
  result: {
    markdown?: string;
    content?: string;
    sections?: { label: string; markdown: string }[];
    sources?: unknown[];
    latency_ms?: number;
    noSourcesWarning?: boolean;
    lengthWarning?: unknown;
    structureWarning?: unknown;
  }
): RatingContext {
  const steps = result.sections?.length
    ? result.sections.map((s) => ({ label: s.label, chars: visibleChars(s.markdown) }))
    : [{ label: label?.trim() || (kind === "plan" ? "실행 계획" : "원고"), chars: visibleChars(result.markdown ?? result.content ?? "") }];
  return {
    kind,
    steps,
    sources: result.sources?.length ?? 0,
    latencyMs: result.latency_ms,
    warnings: { noSources: !!result.noSourcesWarning, length: !!result.lengthWarning, structure: !!result.structureWarning },
  };
}

/** 여러 카드의 구조 정보를 결과 하나로 합친다. */
export function mergeRatingContexts(list: RatingContext[]): RatingContext {
  return {
    kind: list.some((c) => c.kind === "essay") ? "essay" : "plan",
    steps: list.flatMap((c) => c.steps),
    sources: list.reduce((n, c) => n + c.sources, 0),
    latencyMs: Math.max(0, ...list.map((c) => c.latencyMs ?? 0)) || undefined,
    warnings: { noSources: list.some((c) => c.warnings.noSources), length: list.some((c) => c.warnings.length), structure: list.some((c) => c.warnings.structure) },
  };
}

const LENGTH = [
  { v: "long", label: "너무 길어요" },
  { v: "ok", label: "적당해요" },
  { v: "short", label: "너무 짧아요" },
] as const;

/** 결과를 읽은 뒤 올라오는 평가 바. `resultKey`가 바뀌면(새 결과) 다시 묻는다. */
export function ResultRatingBar({ context, resultKey, onFinish }: { context: RatingContext; resultKey: string; onFinish?: () => void }) {
  const t = useT();
  const id = useRef("");
  const [shown, setShown] = useState(false);
  const [quality, setQuality] = useState<string | null>(null);
  const [length, setLength] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const storageKey = `studed:rated:${resultKey}`;

  useEffect(() => {
    setShown(false);
    setQuality(null);
    setLength(null);
    setClosed(false);
    id.current = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "";
    let already = false;
    try {
      already = window.localStorage.getItem(storageKey) === "1";
    } catch {
      /* 저장소가 막혀 있어도 평가는 보여 준다 */
    }
    if (already) {
      setClosed(true);
      return;
    }
    const show = () => setShown(true);
    const timer = window.setTimeout(show, 12000);
    const onScroll = () => {
      const doc = document.documentElement;
      if ((window.scrollY + window.innerHeight) / Math.max(1, doc.scrollHeight) > 0.6) show();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [storageKey]);

  const done = quality !== null && length !== null;
  useEffect(() => {
    if (!done) return;
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* 무시 */
    }
    const timer = window.setTimeout(() => setClosed(true), 2500);
    return () => window.clearTimeout(timer);
  }, [done, storageKey]);

  // 평가를 마치거나 닫으면 알린다 — "개선 돕기" 창이 평가 바와 겹쳐 뜨지 않게 그 뒤에 띄운다.
  useEffect(() => {
    if (closed) onFinish?.();
    // onFinish는 부모가 매 렌더 새로 만들 수 있어 의존성에서 뺀다(닫힘 한 번에 한 번만 알린다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closed]);

  async function send(next: { quality?: string; length?: string }) {
    if (!id.current) return;
    try {
      await fetch("/api/results/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: id.current,
          kind: context.kind,
          context: { steps: context.steps, totalChars: context.steps.reduce((n, s) => n + s.chars, 0), sources: context.sources, latencyMs: context.latencyMs, warnings: context.warnings },
          ...next,
        }),
      });
    } catch {
      /* 평가는 부가 기능 — 실패해도 화면은 그대로 */
    }
  }

  if (!shown || closed) return null;

  const chip =
    "inline-flex items-center gap-1.5 rounded-full border border-border-strong px-3.5 py-1.5 text-[13px] font-medium transition-colors hover:bg-raised";

  return (
    <div
      role="dialog"
      aria-label={t("결과물 평가")}
      className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-xl rounded-2xl border border-border-strong bg-surface px-4 py-3 shadow-lg"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <button type="button" aria-label={t("닫기")} onClick={() => setClosed(true)} className="absolute right-2.5 top-2.5 grid size-6 place-items-center rounded-full text-faint hover:bg-raised hover:text-foreground">
        <X size={14} strokeWidth={1.8} />
      </button>
      {done ? (
        <p className="flex items-center gap-2 pr-6 text-sm font-medium">
          <Check size={16} strokeWidth={2} />
          {t("의견 고마워요. 더 나은 결과물을 만드는 데 쓸게요.")}
        </p>
      ) : quality === null ? (
        <div className="pr-6">
          <p className="text-sm font-semibold">{t("이 결과물 어땠나요?")}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{t("지금은 베타 버전이라 부족한 점이 있을 수 있어요. 남겨 주신 의견은 다음 업데이트에 바로 반영돼요.")}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              className={chip}
              onClick={() => {
                setQuality("good");
                void send({ quality: "good" });
              }}
            >
              <ThumbsUp size={14} strokeWidth={1.8} />
              {t("좋아요")}
            </button>
            <button
              type="button"
              className={chip}
              onClick={() => {
                setQuality("bad");
                void send({ quality: "bad" });
              }}
            >
              <ThumbsDown size={14} strokeWidth={1.8} />
              {t("아쉬워요")}
            </button>
          </div>
        </div>
      ) : (
        <div className="pr-6">
          <p className="text-sm font-semibold">{t("분량은요?")}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {LENGTH.map((o) => (
              <button
                key={o.v}
                type="button"
                className={chip}
                onClick={() => {
                  setLength(o.v);
                  void send({ length: o.v });
                }}
              >
                {t(o.label)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
