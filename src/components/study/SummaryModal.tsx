"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import Modal from "@/components/ui/Modal";
import StudyState, { CachedNote } from "./StudyState";
import ExamNudge from "./ExamNudge";
import { useStudyData, type StudyRef } from "./useStudyData";
import { useT } from "@/lib/i18n";
import { loadStudyPrefs, prefsSignature } from "@/lib/study/prefs";

// 설정을 넣기 전에 저장된 요약에는 format·paragraphs·easyExplanations가 없다.
interface Summary {
  headline: string;
  format?: "bullets" | "prose";
  points: string[];
  paragraphs?: string[];
  keyTerms: { term: string; meaning: string }[];
  easyExplanations?: { topic: string; explanation: string }[];
}

export default function SummaryModal({ studyRef, onClose, reuse = false, onOpenExam }: { studyRef: StudyRef; onClose: () => void; reuse?: boolean; onOpenExam?: () => void }) {
  const t = useT();
  // 설정 > AI 설정의 요약 설정(상세도·형식·쉬운 설명). 창이 열릴 때 한 번 읽는다.
  const [prefs] = useState(() => loadStudyPrefs().summary);
  const { data, error, loading, fromCache, refresh } = useStudyData<Summary>(studyRef, "summary", { prefs }, Infinity, {
    sig: prefsSignature(prefs),
    reuse,
  });
  const prose = data?.format === "prose" && (data.paragraphs?.length ?? 0) > 0;
  return (
    <Modal title={t("핵심 요약")} onClose={onClose} width={640} busy={loading}>
      <StudyState loading={loading} error={error} onRetry={refresh} loadingText={t("핵심만 골라 정리하고 있어요...")}>
        {data && (
          <div>
            <p className="text-xl font-bold leading-snug tracking-tight">{data.headline}</p>
            {prose ? (
              <div className="mt-5 space-y-4">
                {data.paragraphs!.map((p, i) => (
                  <p key={i} className="text-[15px] leading-[1.8]">
                    {p}
                  </p>
                ))}
              </div>
            ) : (
              <ul className="mt-5 space-y-3">
                {data.points.map((p, i) => (
                  <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
                    <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" aria-hidden />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            )}
            {(data.easyExplanations?.length ?? 0) > 0 && (
              <div className="mt-7">
                <h3 className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-faint">
                  <Lightbulb size={13} strokeWidth={1.8} />
                  {t("쉽게 풀어 보기")}
                </h3>
                <div className="space-y-2.5">
                  {data.easyExplanations!.map((e, i) => (
                    <div key={i} className="rounded-xl bg-surface px-4 py-3.5">
                      <p className="text-sm font-bold">{e.topic}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{e.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.keyTerms.length > 0 && (
              <div className="mt-7">
                <h3 className="mb-2.5 text-xs font-semibold text-faint">{t("꼭 알아둘 용어")}</h3>
                <dl className="divide-y divide-border rounded-xl border border-border">
                  {data.keyTerms.map((k, i) => (
                    <div key={i} className="grid gap-1 px-4 py-3 sm:grid-cols-[150px_1fr] sm:gap-4">
                      <dt className="text-sm font-bold">{k.term}</dt>
                      <dd className="text-sm leading-relaxed text-muted">{k.meaning}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            <CachedNote at={fromCache} onRefresh={refresh} busy={loading} />
            <ExamNudge onOpenExam={onOpenExam} />
          </div>
        )}
      </StudyState>
    </Modal>
  );
}
