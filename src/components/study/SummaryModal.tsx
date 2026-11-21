"use client";

import { useState } from "react";
import { ArrowRight, Lightbulb } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import StudyState, { CachedNote } from "./StudyState";
import { useStudyData, type StudyRef } from "./useStudyData";
import { useT } from "@/lib/i18n";
import { loadStudyPrefs, prefsSignature } from "@/lib/study/prefs";
import { flowLine, segmentLine, type SkeletonBox } from "@/lib/study/memo-skeleton";
import { normHeading } from "@/lib/study/section-edit";

// 저장된 옛 요약에는 skeleton·inTask·analogy가 없고, 그 전에는 format·paragraphs·easyExplanations도 없다.
export interface StudySummaryData {
  headline: string;
  format?: "bullets" | "prose";
  points: string[];
  paragraphs?: string[];
  keyTerms: { term: string; meaning: string; inTask?: string; analogy?: string }[];
  easyExplanations?: { topic: string; explanation: string }[];
  skeleton?: SkeletonBox[];
}

/** 옛 저장본의 "키워드 — 한 줄"을 키워드(굵게)와 설명으로 가른다. 꼴이 안 맞으면 통째로 설명으로 본다. */
function splitPoint(p: string): { key: string | null; rest: string } {
  const m = /^(.{1,14}?)\s*(?:—|–|-{1,2}|:)\s+(.+)$/.exec(p);
  return m ? { key: m[1].trim(), rest: m[2].trim() } : { key: null, rest: p };
}

/** 화면 뒤의 결과물에서 이 칸 소제목을 찾는다(칸 이름이 안내문 칸 이름 그대로일 때만 찾아진다). */
function findHeadingEl(box: string): HTMLElement | null {
  const want = normHeading(box);
  if (!want) return null;
  const hits = [...document.querySelectorAll<HTMLElement>("main h1, main h2, main h3, main h4")].filter((h) => normHeading(h.textContent ?? "") === want);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * 요약: 결론 한 문장 + 칸 순서대로 칸마다 한 줄. 한눈에 "이 결과물이 뭘 말하고 어떤 순서인지"를 본다.
 * 낯선 개념 풀이는 "개념", 외울 것 고르기는 "암기"가 맡는다 — 같은 데이터(요약 한 번의 호출)를 나눠 보여 줄 뿐이라 모델 호출이 늘지 않는다.
 */
export default function SummaryModal({
  studyRef,
  onClose,
  reuse = false,
  onOpenConcepts,
}: {
  studyRef: StudyRef;
  onClose: () => void;
  reuse?: boolean;
  onOpenConcepts?: () => void;
}) {
  const t = useT();
  // 설정 > AI 설정의 요약·암기 설정(상세도·쉬운 설명·두음). 창이 열릴 때 한 번 읽는다.
  const [prefs] = useState(() => loadStudyPrefs());
  const { data, error, loading, fromCache, refresh } = useStudyData<StudySummaryData>(studyRef, "summary", { prefs: prefs.summary }, Infinity, {
    sig: prefsSignature(prefs.summary),
    reuse,
  });
  const boxes = data?.skeleton ?? [];
  // 칸을 누르면 닫고 결과물의 그 칸으로 간다(유니브 AI의 "원문 위치로 이동"을 칸 단위로).
  const jump = (box: string) => {
    const el = findHeadingEl(box);
    if (!el) return;
    onClose();
    requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  return (
    <Modal title={t("요약")} onClose={onClose} width={640} busy={loading}>
      <StudyState loading={loading} error={error} onRetry={refresh} loadingText={t("핵심만 골라 정리하고 있어요...")}>
        {data && (
          <div>
            <p className="rounded-2xl bg-surface px-5 py-4 text-lg font-bold leading-snug tracking-tight">{data.headline}</p>

            {boxes.length > 0 ? (
              <div className="mt-7">
                <h3 className="mb-2.5 text-xs font-semibold text-faint">{t("한눈에 보기")}</h3>
                <p className="mb-3 text-[13px] font-semibold leading-relaxed text-muted">{flowLine(boxes)}</p>
                <ol className="divide-y divide-border rounded-xl border border-border">
                  {boxes.map((b, i) => (
                    <li key={i} className="px-4 py-3.5">
                      <p className="flex items-center justify-between gap-3 text-xs font-semibold text-faint">
                        <span>
                          {i + 1}. {b.box}
                        </span>
                        {findHeadingEl(b.box) && (
                          <button onClick={() => jump(b.box)} className="shrink-0 font-medium text-muted underline underline-offset-2 hover:text-foreground">
                            {t("결과물에서 보기")}
                          </button>
                        )}
                      </p>
                      <p className="mt-1 text-[15px] leading-[1.75]">
                        {segmentLine(b.line, b.keywords).map((s, j) =>
                          s.blank === undefined ? <span key={j}>{s.text}</span> : <b key={j} className="font-bold">{s.text}</b>
                        )}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              // 뼈대 방식으로 바꾸기 전에 저장된 요약: 예전 항목을 그대로 보여 주고, 새로 만들면 칸별 한 줄이 생긴다.
              data.points.length > 0 && (
                <ol className="mt-7 divide-y divide-border rounded-xl border border-border">
                  {data.points.map((p, i) => {
                    const { key, rest } = splitPoint(p);
                    return (
                      <li key={i} className="flex items-baseline gap-3 px-4 py-3 text-[14.5px] leading-relaxed">
                        <span className="w-4 shrink-0 text-xs font-semibold tabular-nums text-faint">{i + 1}</span>
                        <span>
                          {key && <b className="mr-1.5 font-bold">{key}</b>}
                          <span className={key ? "text-muted" : ""}>{rest}</span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )
            )}

            <CachedNote at={fromCache} onRefresh={refresh} busy={loading} />

            {onOpenConcepts && data.keyTerms.length > 0 && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3.5">
                <p className="text-sm text-muted">{t("낯선 말이 있다면 개념부터 이해해 볼까요?")}</p>
                <Button size="sm" variant="primary" onClick={onOpenConcepts}>
                  <Lightbulb size={14} strokeWidth={1.8} />
                  {t("개념 보기")}
                  <ArrowRight size={13} strokeWidth={1.8} aria-hidden />
                </Button>
              </div>
            )}
          </div>
        )}
      </StudyState>
    </Modal>
  );
}
