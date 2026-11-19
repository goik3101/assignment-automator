"use client";

import { useState } from "react";
import { ArrowRight, Layers, Lightbulb } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import StudyState, { CachedNote } from "./StudyState";
import SkeletonSheet from "./SkeletonSheet";
import { useStudyData, type StudyRef } from "./useStudyData";
import { useT } from "@/lib/i18n";
import { loadStudyPrefs, prefsSignature } from "@/lib/study/prefs";
import type { SkeletonBox } from "@/lib/study/memo-skeleton";

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

/**
 * 요약: 결과물 → **이해** → 암기. 낯선 개념을 쉬운 말로 풀고, 외울 뼈대 한 장을 미리 보여 준다.
 * 아래 버튼은 같은 뼈대를 카드로 외우는 플래시카드로 이어 준다.
 */
export default function SummaryModal({
  studyRef,
  onClose,
  reuse = false,
  onOpenMemorize,
}: {
  studyRef: StudyRef;
  onClose: () => void;
  reuse?: boolean;
  onOpenMemorize?: () => void;
}) {
  const t = useT();
  // 설정 > AI 설정의 요약·암기 설정(상세도·쉬운 설명·두음). 창이 열릴 때 한 번 읽는다.
  const [prefs] = useState(() => loadStudyPrefs());
  const { data, error, loading, fromCache, refresh } = useStudyData<StudySummaryData>(studyRef, "summary", { prefs: prefs.summary }, Infinity, {
    sig: prefsSignature(prefs.summary),
    reuse,
  });
  const hasSkeleton = (data?.skeleton?.length ?? 0) > 0;
  return (
    <Modal title={t("요약")} onClose={onClose} width={640} busy={loading}>
      <StudyState loading={loading} error={error} onRetry={refresh} loadingText={t("핵심만 골라 쉽게 정리하고 있어요...")}>
        {data && (
          <div>
            <p className="rounded-2xl bg-surface px-5 py-4 text-lg font-bold leading-snug tracking-tight">{data.headline}</p>

            {data.keyTerms.length > 0 && (
              <div className="mt-7">
                <h3 className="mb-1 text-xs font-semibold text-faint">{t("먼저 알아둘 개념")}</h3>
                <p className="mb-3 text-xs text-faint">{t("낯선 말만 골랐어요. 이해하고 나면 외울 건 아래 뼈대뿐이에요.")}</p>
                <div className="space-y-2.5">
                  {data.keyTerms.map((k, i) => (
                    <div key={i} className="rounded-xl border border-border px-4 py-3.5">
                      <p className="text-[15px] font-bold">{k.term}</p>
                      <p className="mt-1 text-sm leading-[1.7]">{k.meaning}</p>
                      {k.inTask && <p className="mt-1.5 text-xs leading-relaxed text-muted">{t("이 결과물에서: {x}", { x: k.inTask })}</p>}
                      {k.analogy && (
                        <p className="mt-1.5 inline-flex items-start gap-1.5 text-xs leading-relaxed text-muted">
                          <Lightbulb size={12} strokeWidth={1.8} className="mt-0.5 shrink-0" />
                          {k.analogy}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasSkeleton ? (
              <div className="mt-8">
                <h3 className="mb-1 text-xs font-semibold text-faint">{t("외울 것: 뼈대 한 장")}</h3>
                <p className="mb-3 text-xs text-faint">{t("문장은 이해한 대로 쓰면 돼요. 굵은 핵심어와 순서만 기억하세요.")}</p>
                <SkeletonSheet boxes={data.skeleton!} mnemonic={prefs.memorize.mnemonic} />
              </div>
            ) : (
              // 뼈대 방식으로 바꾸기 전에 저장된 요약: 예전 항목을 그대로 보여 주고, 새로 만들면 뼈대가 생긴다.
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

            {onOpenMemorize && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3.5">
                <p className="text-sm text-muted">{t("이해했다면 이제 외워 볼까요?")}</p>
                <Button size="sm" variant="primary" onClick={onOpenMemorize}>
                  <Layers size={14} strokeWidth={1.8} />
                  {t("플래시카드로 외우기")}
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
