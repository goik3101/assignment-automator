"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Lightbulb, RotateCcw, Shuffle, SquareCheckBig, X } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import StudyState from "./StudyState";
import type { StudySummaryData } from "./SummaryModal";
import { useStudyData, type StudyRef } from "./useStudyData";
import { useT } from "@/lib/i18n";
import { loadStudyPrefs, prefsSignature } from "@/lib/study/prefs";
import { acronym, segmentLine } from "@/lib/study/memo-skeleton";

interface Card {
  /** order = 칸 순서의 뼈대 카드, concept = 개념 이해에서 본 개념 */
  kind: "order" | "concept";
  front: string;
  /** 뒷면의 큰 글자(뼈대 카드는 핵심어, 개념 카드는 뜻) */
  back: string;
  /** 뼈대 카드의 뒷면 한 줄(핵심어가 굵게 나온다) */
  line?: string;
  keywords?: string[];
  hint?: string;
}

const KIND_LABEL: Record<Card["kind"], string> = { order: "칸 순서", concept: "개념" };

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 뼈대(칸 순서·핵심어)와 개념에서 코드가 카드를 만든다 — 모델 호출 없음. 뼈대 카드가 먼저, 개념 카드가 뒤. */
function buildCards(data: StudySummaryData, mnemonic: boolean): Card[] {
  const order: Card[] = (data.skeleton ?? []).map((b, i) => ({
    kind: "order" as const,
    front: `${i + 1}. ${b.box}`,
    back: b.keywords.length ? b.keywords.join(" · ") : b.line,
    line: b.keywords.length ? b.line : undefined,
    keywords: b.keywords,
    hint: mnemonic && b.keywords.length >= 2 ? acronym(b.keywords) : undefined,
  }));
  const concept: Card[] = (data.keyTerms ?? []).map((k) => ({ kind: "concept" as const, front: k.term, back: k.meaning }));
  return [...order, ...concept];
}

function Deck({ cards, onRestart, onOpenQuiz }: { cards: Card[]; onRestart: () => void; onOpenQuiz?: () => void }) {
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
            ? t("전부 알고 있어요. 이제 퀴즈로 빈칸을 채워 볼까요?")
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
          {onOpenQuiz && (
            <Button variant={unsure.length > 0 ? "secondary" : "primary"} onClick={onOpenQuiz}>
              <SquareCheckBig size={15} strokeWidth={1.8} />
              {t("퀴즈 풀기")}
            </Button>
          )}
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
        <span className={["mb-3 text-xs font-semibold", flipped ? "text-background/60" : "text-faint"].join(" ")}>
          {flipped ? t("정답") : t(KIND_LABEL[card.kind])}
        </span>
        {flipped ? (
          <>
            <span className="text-xl font-bold leading-snug tracking-tight">{card.back}</span>
            {card.line && (
              <span className="mt-4 max-w-md text-sm leading-relaxed text-background/70">
                {segmentLine(card.line, card.keywords ?? []).map((s, j) =>
                  s.blank === undefined ? <span key={j}>{s.text}</span> : <b key={j} className="text-background">{s.text}</b>
                )}
              </span>
            )}
          </>
        ) : (
          <span className="text-[22px] font-bold leading-snug tracking-tight">{card.front}</span>
        )}
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

/**
 * 플래시카드: 요약에서 만든 **뼈대**(칸 이름 → 핵심어)와 개념(용어 → 쉬운 뜻)을 뒤집어 본다. 카드는 코드가 만들어 모델 호출이 없다.
 * 요약이 저장돼 있으면 그것을 쓰고, 없으면 요약부터 만든다(처음 한 번만 10초 남짓).
 */
export default function FlashcardsModal({
  studyRef,
  onClose,
  onOpenQuiz,
}: {
  studyRef: StudyRef;
  onClose: () => void;
  onOpenQuiz?: () => void;
}) {
  const t = useT();
  const [prefs] = useState(() => loadStudyPrefs());
  // reuse=true: 어떤 설정으로 만든 요약이든 저장돼 있으면 그대로 쓴다.
  const { data, error, loading, refresh } = useStudyData<StudySummaryData>(studyRef, "summary", { prefs: prefs.summary }, Infinity, {
    sig: prefsSignature(prefs.summary),
    reuse: true,
  });
  const [seed, setSeed] = useState(0);
  const all = useMemo(() => (data ? buildCards(data, prefs.memorize.mnemonic) : []), [data, prefs.memorize.mnemonic]);
  const cards = useMemo(() => (seed === 0 ? all : shuffled(all)), [all, seed]);
  return (
    <Modal title={t("플래시카드")} onClose={onClose} width={600} busy={loading}>
      <StudyState loading={loading} error={error} onRetry={refresh} loadingText={t("외울 것만 골라 카드로 만들고 있어요...")}>
        {data && cards.length > 0 ? (
          <Deck key={seed} cards={cards} onRestart={() => setSeed((s) => s + 1)} onOpenQuiz={onOpenQuiz} />
        ) : (
          data && (
            <div className="py-10 text-center">
              <p className="text-sm leading-relaxed text-muted">{t("이 요약에는 외울 뼈대가 없어요. 새로 만들면 외울 것만 뽑아 줘요.")}</p>
              <Button className="mt-4" variant="primary" onClick={refresh}>
                {t("새로 만들기")}
              </Button>
            </div>
          )
        )}
      </StudyState>
    </Modal>
  );
}
