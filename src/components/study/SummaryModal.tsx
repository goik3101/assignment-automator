"use client";

import Modal from "@/components/ui/Modal";
import StudyState, { CachedNote } from "./StudyState";
import { useStudyData, type StudyRef } from "./useStudyData";
import { useT } from "@/lib/i18n";

interface Summary {
  headline: string;
  points: string[];
  keyTerms: { term: string; meaning: string }[];
}

export default function SummaryModal({ studyRef, onClose }: { studyRef: StudyRef; onClose: () => void }) {
  const t = useT();
  const { data, error, loading, fromCache, refresh } = useStudyData<Summary>(studyRef, "summary");
  return (
    <Modal title={t("핵심 요약")} onClose={onClose} width={640} busy={loading}>
      <StudyState loading={loading} error={error} onRetry={refresh} loadingText={t("핵심만 골라 정리하고 있어요...")}>
        {data && (
          <div>
            <p className="text-xl font-bold leading-snug tracking-tight">{data.headline}</p>
            <ul className="mt-5 space-y-3">
              {data.points.map((p, i) => (
                <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
                  <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" aria-hidden />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
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
          </div>
        )}
      </StudyState>
    </Modal>
  );
}
