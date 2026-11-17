"use client";

import { useRef, useState } from "react";
import { useT } from "@/lib/i18n";

// 결과물 아래의 "어땠나요?" 두 줄 평가(품질·분량). 실제 학생이 느낀 길이·품질을 모아 분량 기준을 보정하는 데 쓴다.
// 본문·학생 입력은 보내지 않는다 — 칸 이름과 칸별 글자 수 같은 구조 정보만(api/results/rating, 마이그레이션 0022).
export interface RatingContext {
  kind: "essay" | "plan";
  steps: { label: string; chars: number }[];
  sources: number;
  latencyMs?: number;
  warnings: { noSources: boolean; length: boolean; structure: boolean };
}

const visibleChars = (md: string) => md.replace(/\[\d+(?:,\s*\d+)*\]/g, "").replace(/[#*_>|`-]/g, "").replace(/\s/g, "").length;

/** 결과물에서 구조 정보만 뽑는다(본문 제외). */
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

const QUALITY = [
  { v: "good", label: "좋아요" },
  { v: "bad", label: "아쉬워요" },
] as const;
const LENGTH = [
  { v: "long", label: "너무 길어요" },
  { v: "ok", label: "적당해요" },
  { v: "short", label: "너무 짧아요" },
] as const;

export function ResultRating({ context }: { context: RatingContext }) {
  const t = useT();
  const id = useRef<string>("");
  if (!id.current && typeof crypto !== "undefined" && "randomUUID" in crypto) id.current = crypto.randomUUID();
  const [quality, setQuality] = useState<string | null>(null);
  const [length, setLength] = useState<string | null>(null);

  async function send(next: { quality?: string; length?: string }) {
    if (!id.current) return;
    try {
      await fetch("/api/results/rating", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: id.current, kind: context.kind, context: { steps: context.steps, totalChars: context.steps.reduce((n, s) => n + s.chars, 0), sources: context.sources, latencyMs: context.latencyMs, warnings: context.warnings }, ...next }),
      });
    } catch {
      /* 평가는 부가 기능 — 실패해도 화면은 그대로 */
    }
  }

  const btn = (active: boolean) =>
    [
      "rounded-full border px-3 py-1 text-[13px] transition-colors",
      active ? "border-foreground bg-foreground text-background" : "border-border-strong text-muted hover:text-foreground",
    ].join(" ");

  return (
    <div className="mt-6 space-y-2 border-t border-border pt-4" aria-label={t("결과물 평가")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[13px] font-semibold">{t("이 결과물 어땠나요?")}</span>
        {QUALITY.map((o) => (
          <button
            key={o.v}
            type="button"
            className={btn(quality === o.v)}
            aria-pressed={quality === o.v}
            onClick={() => {
              setQuality(o.v);
              void send({ quality: o.v });
            }}
          >
            {t(o.label)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[13px] font-semibold">{t("분량은요?")}</span>
        {LENGTH.map((o) => (
          <button
            key={o.v}
            type="button"
            className={btn(length === o.v)}
            aria-pressed={length === o.v}
            onClick={() => {
              setLength(o.v);
              void send({ length: o.v });
            }}
          >
            {t(o.label)}
          </button>
        ))}
      </div>
      {(quality || length) && <p className="text-xs text-faint">{t("의견 고마워요. 더 나은 결과물을 만드는 데 쓸게요.")}</p>}
    </div>
  );
}
