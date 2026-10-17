"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Lightbulb, LoaderCircle, PenLine } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import StudyState from "./StudyState";
import { useStudyData, type StudyRef } from "./useStudyData";
import { useT } from "@/lib/i18n";

interface Exam {
  title: string;
  durationMin: number;
  task: string;
  requirements: string[];
  hints: string[];
  keyPoints: string[];
}
interface Grade {
  score: number;
  covered: string[];
  missed: string[];
  factIssues: { excerpt: string; problem: string }[];
  comment: string;
}

const clock = (sec: number) => `${Math.floor(Math.abs(sec) / 60)}:${String(Math.abs(sec) % 60).padStart(2, "0")}`;

function Paper({ exam, studyRef, onAgain }: { exam: Exam; studyRef: StudyRef; onAgain: () => void }) {
  const t = useT();
  const [answer, setAnswer] = useState("");
  const [hintsShown, setHintsShown] = useState(0);
  const [remaining, setRemaining] = useState(exam.durationMin * 60);
  const [grading, setGrading] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef<number | null>(null);

  useEffect(() => {
    if (grade) return;
    // 시작 시각은 effect에서 한 번만 정한다(렌더 중에는 Date.now()를 부르지 않는다).
    if (startedRef.current === null) startedRef.current = Date.now();
    const timer = setInterval(() => setRemaining(exam.durationMin * 60 - Math.floor((Date.now() - (startedRef.current ?? Date.now())) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [exam.durationMin, grade]);

  async function submit() {
    setError(null);
    setGrading(true);
    try {
      const res = await fetch("/api/study/exam/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: studyRef, task: exam.task, keyPoints: exam.keyPoints, answer }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? t("채점하지 못했어요."));
      setGrade(json as Grade);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("채점하지 못했어요. 쓴 답안은 그대로 있어요."));
    } finally {
      setGrading(false);
    }
  }

  if (grade) {
    return (
      <div className="space-y-6">
        <div className="flex items-end gap-3">
          <p className="text-5xl font-bold tabular-nums leading-none">{grade.score}</p>
          <p className="pb-1 text-sm text-muted">{t("/ 100점 · 힌트 {n}번 사용", { n: hintsShown })}</p>
        </div>
        <p className="text-[15px] leading-relaxed">{grade.comment}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-border bg-background p-4">
            <h3 className="mb-2 text-xs font-semibold text-faint">{t("잘 담았어요")}</h3>
            {grade.covered.length ? (
              <ul className="space-y-1.5 text-sm">
                {grade.covered.map((c, i) => (
                  <li key={i} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foreground" aria-hidden />{c}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{t("아직 없어요.")}</p>
            )}
          </section>
          <section className="rounded-xl border border-border bg-background p-4">
            <h3 className="mb-2 text-xs font-semibold text-faint">{t("빠졌어요")}</h3>
            {grade.missed.length ? (
              <ul className="space-y-1.5 text-sm text-muted">
                {grade.missed.map((c, i) => (
                  <li key={i} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-faint" aria-hidden />{c}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{t("빠진 내용이 없어요.")}</p>
            )}
          </section>
        </div>
        {grade.factIssues.length > 0 && (
          <section className="rounded-xl border border-danger/40 p-4">
            <h3 className="mb-2 text-xs font-semibold text-danger">{t("확인해 보세요")}</h3>
            <ul className="space-y-2 text-sm">
              {grade.factIssues.map((f, i) => (
                <li key={i}>
                  <p className="font-semibold">{f.excerpt}</p>
                  <p className="text-muted">{f.problem}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="flex justify-end">
          <Button variant="primary" onClick={onAgain}>
            {t("새 시험 보기")}
          </Button>
        </div>
      </div>
    );
  }

  const tooShort = answer.trim().length < 20;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-faint">{t("시험지")}</p>
        <p className={["inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums", remaining < 0 ? "text-danger" : ""].join(" ")} role="timer" aria-live="off">
          <Clock size={14} strokeWidth={1.8} />
          {remaining < 0 ? t("+{time} 초과", { time: clock(remaining) }) : clock(remaining)}
        </p>
      </div>
      <div className="rounded-2xl border border-border-strong bg-background p-5">
        <p className="text-[16px] font-bold leading-relaxed">{exam.task}</p>
        {exam.requirements.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm text-muted">
            {exam.requirements.map((r, i) => (
              <li key={i} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-faint" aria-hidden />{r}</li>
            ))}
          </ul>
        )}
      </div>

      {hintsShown > 0 && (
        <ol className="space-y-2" aria-label={t("열어 본 힌트")}>
          {exam.hints.slice(0, hintsShown).map((h, i) => (
            <li key={i} className="rounded-xl bg-raised px-4 py-3 text-sm leading-relaxed">
              <span className="mr-2 font-semibold">{t("힌트 {n}", { n: i + 1 })}</span>
              {h.replace(/^힌트\s*\d+\s*[:：]\s*/, "")}
            </li>
          ))}
        </ol>
      )}

      <label className="block">
        <span className="mb-1.5 flex items-center justify-between text-[13px] font-semibold">
          <span className="inline-flex items-center gap-1.5"><PenLine size={14} strokeWidth={1.8} />{t("내 답안")}</span>
          <span className="font-normal text-faint tabular-nums">{t("{n}자", { n: answer.trim().length })}</span>
        </span>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={9}
          placeholder={t("공부한 내용을 떠올리며 빈 종이에 쓰듯이 적어 보세요.")}
          className="w-full resize-y rounded-xl border border-border-strong bg-background px-4 py-3 text-[14.5px] leading-relaxed placeholder:text-faint focus:border-foreground"
        />
      </label>

      {error && <p role="alert" className="rounded-xl border border-danger/50 px-4 py-3 text-sm text-danger">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => setHintsShown((n) => Math.min(exam.hints.length, n + 1))} disabled={hintsShown >= exam.hints.length}>
          <Lightbulb size={14} strokeWidth={1.8} />
          {t("힌트 보기 ({n}/{total})", { n: hintsShown, total: exam.hints.length })}
        </Button>
        <Button variant="primary" size="lg" onClick={submit} disabled={tooShort || grading}>
          {grading ? (
            <>
              <LoaderCircle size={16} strokeWidth={1.8} className="animate-spin" />
              {t("채점하는 중")}
            </>
          ) : (
            t("제출하고 채점받기")
          )}
        </Button>
      </div>
      {tooShort && answer.length > 0 && <p className="text-xs text-faint">{t("20자 이상 써야 채점할 수 있어요.")}</p>}
    </div>
  );
}

export default function ExamModal({ studyRef, onClose }: { studyRef: StudyRef; onClose: () => void }) {
  const t = useT();
  // 시험은 볼 때마다 새 문제가 나오도록 캐시하지 않는다(ttl 0).
  const { data, error, loading, refresh } = useStudyData<Exam>(studyRef, "exam", {}, 0);
  const [run, setRun] = useState(0);
  return (
    <Modal title={data?.title ?? t("가상 시험")} onClose={onClose} width={680} busy={loading}>
      <StudyState loading={loading} error={error} onRetry={refresh} loadingText={t("시험 문제를 만들고 있어요...")}>
        {data && (
          <Paper
            key={run}
            exam={data}
            studyRef={studyRef}
            onAgain={() => {
              setRun((r) => r + 1);
              void refresh();
            }}
          />
        )}
      </StudyState>
    </Modal>
  );
}
