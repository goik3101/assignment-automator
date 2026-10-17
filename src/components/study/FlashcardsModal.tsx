"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Lightbulb, RotateCcw, Shuffle, X } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import StudyState, { CachedNote } from "./StudyState";
import { useStudyData, type StudyRef } from "./useStudyData";
import { useT } from "@/lib/i18n";

interface Card {
  front: string;
  back: string;
  hint?: string;
}

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function Deck({ cards, onRestart }: { cards: Card[]; onRestart: () => void }) {
  const t = useT();
  const [queue, setQueue] = useState<Card[]>(cards);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [hint, setHint] = useState(false);
  const [known, setKnown] = useState(0);
  const [unsure, setUnsure] = useState<Card[]>([]);
  const [round, setRound] = useState(1);
  const done = i >= queue.length;
  const card = queue[i];

  function next(wasKnown: boolean) {
    if (wasKnown) setKnown((k) => k + 1);
    else setUnsure((u) => [...u, card]);
    setFlipped(false);
    setHint(false);
    setI((v) => v + 1);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (done) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((v) => !v);
      } else if (flipped && e.key === "ArrowRight") next(true);
      else if (flipped && e.key === "ArrowLeft") next(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (done) {
    return (
      <div className="flex flex-col items-center gap-5 py-8 text-center">
        <p className="text-4xl font-bold tabular-nums">
          {known}
          <span className="text-xl font-medium text-faint"> / {queue.length}</span>
        </p>
        <p className="text-sm text-muted">
          {unsure.length === 0
            ? t("전부 알고 있어요. 이제 가상 시험으로 확인해 볼까요?")
            : t("헷갈린 카드가 {n}장 있어요. 한 번 더 보면 확실히 기억나요.", { n: unsure.length })}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {unsure.length > 0 && (
            <Button
              variant="primary"
              onClick={() => {
                setQueue(shuffled(unsure));
                setUnsure([]);
                setKnown(0);
                setI(0);
                setRound((r) => r + 1);
              }}
            >
              <RotateCcw size={15} strokeWidth={1.8} />
              {t("헷갈린 카드만 다시 ({n}장)", { n: unsure.length })}
            </Button>
          )}
          <Button onClick={onRestart}>
            <Shuffle size={15} strokeWidth={1.8} />
            {t("처음부터 섞어서 보기")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-xs text-faint">
        <span className="tabular-nums">
          {i + 1} / {queue.length}
          {round > 1 && ` ${t("· {n}번째 복습", { n: round })}`}
        </span>
        <div className="h-1 w-32 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={i} aria-valuemin={0} aria-valuemax={queue.length}>
          <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${(i / queue.length) * 100}%` }} />
        </div>
      </div>

      <button
        onClick={() => setFlipped((v) => !v)}
        aria-label={flipped ? t("카드 앞면 보기") : t("카드 뒷면(정답) 보기")}
        className={[
          "flex min-h-[280px] w-full flex-col items-center justify-center rounded-3xl p-10 text-center transition-colors",
          flipped ? "bg-foreground text-background" : "bg-surface hover:bg-raised",
        ].join(" ")}
      >
        <span className={["mb-3 text-xs font-semibold", flipped ? "text-background/60" : "text-faint"].join(" ")}>{flipped ? t("정답") : t("질문")}</span>
        <span className={["font-bold leading-snug tracking-tight", flipped ? "text-xl" : "text-[22px]"].join(" ")}>
          {flipped ? card.back : card.front}
        </span>
        {!flipped && hint && card.hint && <span className="mt-4 text-sm text-muted">{t("힌트: {hint}", { hint: card.hint })}</span>}
        {!flipped && <span className="mt-6 text-xs text-faint">{t("눌러서 정답 보기 · Space")}</span>}
      </button>

      <div className="mt-4 flex items-center justify-between gap-3">
        {!flipped ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setHint(true)} disabled={!card.hint || hint}>
              <Lightbulb size={14} strokeWidth={1.8} />
              {t("힌트")}
            </Button>
            <Button variant="primary" onClick={() => setFlipped(true)}>
              {t("정답 보기")}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => next(false)} className="flex-1">
              <X size={15} strokeWidth={1.9} />
              {t("헷갈려요")}
              <ArrowLeft size={13} strokeWidth={1.8} className="text-faint" aria-hidden />
            </Button>
            <Button variant="primary" onClick={() => next(true)} className="flex-1">
              <Check size={15} strokeWidth={2} />
              {t("알아요")}
              <ArrowRight size={13} strokeWidth={1.8} className="opacity-60" aria-hidden />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function FlashcardsModal({ studyRef, onClose }: { studyRef: StudyRef; onClose: () => void }) {
  const t = useT();
  const { data, error, loading, fromCache, refresh } = useStudyData<{ cards: Card[] }>(studyRef, "flashcards", { count: 10 });
  const [seed, setSeed] = useState(0);
  const cards = useMemo(() => (data ? (seed === 0 ? data.cards : shuffled(data.cards)) : []), [data, seed]);
  return (
    <Modal title={t("플래시카드")} onClose={onClose} width={600} busy={loading}>
      <StudyState loading={loading} error={error} onRetry={refresh} loadingText={t("외울 것만 골라 카드로 만들고 있어요...")}>
        {data && data.cards.length > 0 ? (
          <>
            <Deck key={seed} cards={cards} onRestart={() => setSeed((s) => s + 1)} />
            <CachedNote at={fromCache} onRefresh={() => { setSeed(0); void refresh(); }} busy={loading} />
          </>
        ) : (
          data && <p className="py-10 text-center text-sm text-muted">{t("카드로 만들 만한 내용이 부족해요.")}</p>
        )}
      </StudyState>
    </Modal>
  );
}
