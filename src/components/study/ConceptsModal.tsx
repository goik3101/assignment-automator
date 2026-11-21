"use client";

import { useState } from "react";
import { ArrowRight, Layers, Lightbulb } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import StudyState, { CachedNote } from "./StudyState";
import type { StudySummaryData } from "./SummaryModal";
import { useStudyData, type StudyRef } from "./useStudyData";
import { useT } from "@/lib/i18n";
import { loadStudyPrefs, prefsSignature } from "@/lib/study/prefs";

/**
 * 개념: 이 결과물에서 학생이 모를 만한 낯선 말만 골라 쉬운 말로 풀어 준다(요약과 같은 데이터를 쓰므로 별도 모델 호출이 없다).
 * 이해하고 나면 외울 것은 뼈대뿐이라, 아래 버튼은 같은 개념을 카드로 외우는 플래시카드로 이어 준다.
 */
export default function ConceptsModal({
  studyRef,
  onClose,
  reuse = false,
  onOpenFlashcards,
}: {
  studyRef: StudyRef;
  onClose: () => void;
  reuse?: boolean;
  onOpenFlashcards?: () => void;
}) {
  const t = useT();
  const [prefs] = useState(() => loadStudyPrefs());
  const { data, error, loading, fromCache, refresh } = useStudyData<StudySummaryData>(studyRef, "summary", { prefs: prefs.summary }, Infinity, {
    sig: prefsSignature(prefs.summary),
    reuse: true,
  });
  return (
    <Modal title={t("개념")} onClose={onClose} width={640} busy={loading}>
      <StudyState loading={loading} error={error} onRetry={refresh} loadingText={t("낯선 개념만 골라 쉽게 풀고 있어요...")}>
        {data && (
          <div>
            <h3 className="mb-1 text-xs font-semibold text-faint">{t("먼저 알아둘 개념")}</h3>
            <p className="mb-3 text-xs text-faint">{t("낯선 말만 골랐어요. 이해하고 나면 외울 건 뼈대뿐이에요.")}</p>
            {data.keyTerms.length > 0 ? (
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
            ) : (
              <p className="py-8 text-center text-sm text-muted">{t("낯선 개념이 많지 않아요. 바로 외워도 돼요.")}</p>
            )}

            {/* 옛 저장본(개념 이해로 바꾸기 전)의 "쉽게 풀어 보기"는 그대로 보여 준다. */}
            {(data.easyExplanations?.length ?? 0) > 0 && (
              <div className="mt-7 space-y-2.5">
                {data.easyExplanations!.map((e, i) => (
                  <div key={i} className="rounded-xl bg-surface px-4 py-3.5">
                    <p className="text-sm font-bold">{e.topic}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{e.explanation}</p>
                  </div>
                ))}
              </div>
            )}

            <CachedNote at={fromCache} onRefresh={refresh} busy={loading} />

            {onOpenFlashcards && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3.5">
                <p className="text-sm text-muted">{t("이해했다면 이제 외워 볼까요?")}</p>
                <Button size="sm" variant="primary" onClick={onOpenFlashcards}>
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
