"use client";

import { Fragment, useState } from "react";
import { CircleCheck, CircleX, RotateCcw } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import StudyState, { CachedNote } from "./StudyState";
import { useStudyData, type StudyRef } from "./useStudyData";
import { useT } from "@/lib/i18n";
import { isTextAnswerCorrect, type QuizQuestion as Question } from "@/lib/study/quiz-validate";
import { loadStudyPrefs, prefsSignature } from "@/lib/study/prefs";

const isText = (q: Question) => q.type === "short" || q.type === "blank";

/** 빈칸 문제의 ____ 를 눈에 띄는 빈칸으로 보여 준다. */
function QuestionText({ q }: { q: Question }) {
  const t = useT();
  if (q.type !== "blank") return <>{q.question}</>;
  const parts = q.question.split(/_{2,}/);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && <span className="mx-1 inline-block w-20 border-b-2 border-foreground/60 align-baseline" aria-label={t("빈칸")} />}
        </Fragment>
      ))}
    </>
  );
}

function Runner({ questions, onRetryAll }: { questions: Question[]; onRetryAll: () => void }) {
  const t = useT();
  const [list, setList] = useState(questions);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [textResult, setTextResult] = useState<"right" | "wrong" | null>(null);
  const [wrong, setWrong] = useState<Question[]>([]);
  const [score, setScore] = useState(0);
  const done = i >= list.length;
  const q = list[i];
  const answered = picked !== null || textResult !== null;
  const correct = q && (isText(q) ? textResult === "right" : picked === q.answerIndex);

  function choose(idx: number) {
    if (answered) return;
    setPicked(idx);
    if (idx === q.answerIndex) setScore((s) => s + 1);
    else setWrong((w) => [...w, q]);
  }
  function submitText() {
    if (answered || !typed.trim()) return;
    const ok = isTextAnswerCorrect(typed, q);
    setTextResult(ok ? "right" : "wrong");
    if (ok) setScore((s) => s + 1);
    else setWrong((w) => [...w, q]);
  }
  // 표기만 달라 오답 처리된 경우 학생이 직접 정답으로 바꿀 수 있다.
  function markRight() {
    setTextResult("right");
    setScore((s) => s + 1);
    setWrong((w) => w.filter((x) => x !== q));
  }
  function next() {
    setPicked(null);
    setTyped("");
    setTextResult(null);
    setI((v) => v + 1);
  }

  if (done) {
    const pct = Math.round((score / list.length) * 100);
    return (
      <div className="flex flex-col items-center gap-5 py-8 text-center">
        <p className="text-4xl font-bold tabular-nums">
          {score}
          <span className="text-xl font-medium text-faint"> / {list.length}</span>
        </p>
        <p className="text-sm text-muted">
          {pct === 100
            ? t("전부 맞혔어요. 내용을 잘 이해하고 있어요.")
            : pct >= 70
              ? t("잘 이해하고 있어요. 틀린 문제만 다시 풀어 볼까요?")
              : t("아직 헷갈리는 부분이 있어요. 틀린 문제를 다시 풀어 보세요.")}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {wrong.length > 0 && (
            <Button
              variant="primary"
              onClick={() => {
                setList(wrong);
                setWrong([]);
                setScore(0);
                setI(0);
                setPicked(null);
                setTyped("");
                setTextResult(null);
              }}
            >
              <RotateCcw size={15} strokeWidth={1.8} />
              {t("틀린 문제만 다시 ({n}문제)", { n: wrong.length })}
            </Button>
          )}
          <Button onClick={onRetryAll}>{t("처음부터 다시 풀기")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-xs text-faint">
          <span className="tabular-nums">
            {i + 1} / {list.length}
          </span>
          <span className="tabular-nums">{t("맞힌 문제 {n}", { n: score })}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={list.length} aria-valuenow={i + (answered ? 1 : 0)}>
          <div className="h-full rounded-full bg-foreground transition-all duration-300" style={{ width: `${((i + (answered ? 1 : 0)) / list.length) * 100}%` }} />
        </div>
      </div>
      <p className="mb-2 text-xs font-semibold text-faint">
        {q.type === "choice" ? t("객관식") : q.type === "ox" ? t("OX") : q.type === "short" ? t("주관식") : t("빈칸 채우기")}
      </p>
      <p className="text-[19px] font-bold leading-relaxed tracking-tight">
        <QuestionText q={q} />
      </p>

      {isText(q) && (
        <form
          className="mt-5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitText();
          }}
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={answered}
            autoFocus
            maxLength={60}
            aria-label={t("답 입력")}
            placeholder={q.type === "blank" ? t("빈칸에 들어갈 말") : t("답을 짧게 써 보세요")}
            className={[
              "h-12 min-w-0 flex-1 rounded-2xl px-4 text-[15px] outline-none transition-colors placeholder:text-faint",
              textResult === "right" ? "bg-foreground font-semibold text-background" : textResult === "wrong" ? "bg-danger/10 text-danger" : "bg-surface focus:bg-raised",
            ].join(" ")}
          />
          {!answered && (
            <Button type="submit" variant="primary" disabled={!typed.trim()}>
              {t("확인")}
            </Button>
          )}
        </form>
      )}

      <ul className={["mt-5 gap-2.5", q.type === "ox" ? "grid grid-cols-2" : "flex flex-col", isText(q) ? "hidden" : ""].join(" ")}>
        {q.choices.map((c, idx) => {
          const isAnswer = idx === q.answerIndex;
          const isPicked = picked === idx;
          const state = !answered ? "idle" : isAnswer ? "right" : isPicked ? "wrong" : "dim";
          return (
            <li key={idx}>
              <button
                onClick={() => choose(idx)}
                disabled={answered}
                aria-pressed={isPicked}
                className={[
                  "flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left text-[15px] leading-snug transition-colors",
                  q.type === "ox" ? "justify-center py-7 text-2xl font-bold" : "",
                  state === "idle" ? "bg-surface hover:bg-raised" : "",
                  state === "right" ? "bg-foreground font-semibold text-background" : "",
                  state === "wrong" ? "bg-danger/10 text-danger" : "",
                  state === "dim" ? "bg-surface text-faint" : "",
                ].join(" ")}
              >
                {q.type === "choice" && (
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-background/70 text-xs font-semibold tabular-nums text-foreground">{idx + 1}</span>
                )}
                <span className="flex-1">{c}</span>
                {answered && isAnswer && <CircleCheck size={18} strokeWidth={1.8} className="shrink-0" aria-label={t("정답")} />}
                {answered && isPicked && !isAnswer && <CircleX size={18} strokeWidth={1.8} className="shrink-0" aria-label={t("오답")} />}
              </button>
            </li>
          );
        })}
      </ul>

      {answered && (
        <div role="status" className="mt-5 rounded-2xl bg-surface p-5">
          <p className="mb-1 text-xs font-semibold text-faint">{correct ? t("맞았어요") : t("아쉬워요")}</p>
          {isText(q) && (
            <p className="mb-1.5 text-sm">
              {t("정답")}: <span className="font-bold">{q.answer}</span>
            </p>
          )}
          <p className="text-sm leading-relaxed text-muted">{q.explanation}</p>
          {isText(q) && textResult === "wrong" && (
            <button onClick={markRight} className="mt-3 text-xs font-semibold text-muted underline underline-offset-2 hover:text-foreground">
              {t("같은 뜻으로 썼어요 — 맞은 걸로 할게요")}
            </button>
          )}
        </div>
      )}
      <div className="mt-5 flex justify-end">
        <Button variant="primary" onClick={next} disabled={!answered}>
          {i + 1 === list.length ? t("결과 보기") : t("다음 문제")}
        </Button>
      </div>
    </div>
  );
}

export default function QuizModal({ studyRef, onClose, reuse = false }: { studyRef: StudyRef; onClose: () => void; reuse?: boolean }) {
  const t = useT();
  // 설정 > AI 설정의 퀴즈 설정. 창이 열릴 때 한 번 읽는다(이 창은 버튼을 누른 뒤에만 그려져 서버 렌더와 어긋나지 않는다).
  const [prefs] = useState(() => loadStudyPrefs().quiz);
  const { data, error, loading, fromCache, refresh } = useStudyData<{ questions: Question[] }>(studyRef, "quiz", { prefs }, Infinity, {
    sig: prefsSignature(prefs),
    reuse,
  });
  const [run, setRun] = useState(0);
  return (
    <Modal title={t("퀴즈")} onClose={onClose} width={620} busy={loading}>
      <StudyState loading={loading} error={error} onRetry={refresh} loadingText={t("내용을 읽고 문제를 만들고 있어요...")}>
        {data && data.questions.length > 0 ? (
          <>
            <Runner key={run} questions={data.questions} onRetryAll={() => setRun((r) => r + 1)} />
            <CachedNote at={fromCache} onRefresh={() => { setRun((r) => r + 1); void refresh(); }} busy={loading} />
          </>
        ) : (
          data && <p className="py-10 text-center text-sm text-muted">{t("문제로 만들 만한 내용이 부족해요.")}</p>
        )}
      </StudyState>
    </Modal>
  );
}
