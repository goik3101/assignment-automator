"use client";

import { useState } from "react";
import { CircleCheck, CircleX, RotateCcw } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import StudyState, { CachedNote } from "./StudyState";
import { useStudyData, type StudyRef } from "./useStudyData";

interface Question {
  type: "choice" | "ox";
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
}

function Runner({ questions, onRetryAll }: { questions: Question[]; onRetryAll: () => void }) {
  const [list, setList] = useState(questions);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [wrong, setWrong] = useState<Question[]>([]);
  const [score, setScore] = useState(0);
  const done = i >= list.length;
  const q = list[i];
  const answered = picked !== null;

  function choose(idx: number) {
    if (answered) return;
    setPicked(idx);
    if (idx === q.answerIndex) setScore((s) => s + 1);
    else setWrong((w) => [...w, q]);
  }
  function next() {
    setPicked(null);
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
          {pct === 100 ? "전부 맞혔어요. 내용을 잘 이해하고 있어요." : pct >= 70 ? "잘 이해하고 있어요. 틀린 문제만 다시 풀어 볼까요?" : "아직 헷갈리는 부분이 있어요. 틀린 문제를 다시 풀어 보세요."}
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
              }}
            >
              <RotateCcw size={15} strokeWidth={1.8} />
              틀린 문제만 다시 ({wrong.length}문제)
            </Button>
          )}
          <Button onClick={onRetryAll}>처음부터 다시 풀기</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-xs text-faint">
        <span className="tabular-nums">
          문제 {i + 1} / {list.length}
        </span>
        <span className="tabular-nums">맞힌 문제 {score}</span>
      </div>
      <p className="text-[17px] font-bold leading-relaxed tracking-tight">{q.question}</p>

      <ul className={["mt-5 gap-2.5", q.type === "ox" ? "grid grid-cols-2" : "flex flex-col"].join(" ")}>
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
                  "flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-[14.5px] leading-snug transition-colors",
                  q.type === "ox" ? "justify-center py-6 text-2xl font-bold" : "",
                  state === "idle" ? "border-border-strong hover:border-foreground hover:bg-raised" : "",
                  state === "right" ? "border-foreground bg-raised font-semibold" : "",
                  state === "wrong" ? "border-danger/70 text-danger" : "",
                  state === "dim" ? "border-border text-faint" : "",
                ].join(" ")}
              >
                {q.type === "choice" && (
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current text-xs font-semibold tabular-nums">{idx + 1}</span>
                )}
                <span className="flex-1">{c}</span>
                {answered && isAnswer && <CircleCheck size={18} strokeWidth={1.8} className="shrink-0" aria-label="정답" />}
                {answered && isPicked && !isAnswer && <CircleX size={18} strokeWidth={1.8} className="shrink-0" aria-label="오답" />}
              </button>
            </li>
          );
        })}
      </ul>

      {answered && (
        <div role="status" className="mt-5 rounded-xl border border-border bg-background p-4">
          <p className="mb-1 text-xs font-semibold text-faint">{picked === q.answerIndex ? "맞았어요" : "아쉬워요"}</p>
          <p className="text-sm leading-relaxed text-muted">{q.explanation}</p>
        </div>
      )}
      <div className="mt-5 flex justify-end">
        <Button variant="primary" onClick={next} disabled={!answered}>
          {i + 1 === list.length ? "결과 보기" : "다음 문제"}
        </Button>
      </div>
    </div>
  );
}

export default function QuizModal({ studyRef, onClose }: { studyRef: StudyRef; onClose: () => void }) {
  const { data, error, loading, fromCache, refresh } = useStudyData<{ questions: Question[] }>(studyRef, "quiz", { count: 6 });
  const [run, setRun] = useState(0);
  return (
    <Modal title="퀴즈" onClose={onClose} width={620} busy={loading}>
      <StudyState loading={loading} error={error} onRetry={refresh} loadingText="내용을 읽고 문제를 만들고 있어요...">
        {data && data.questions.length > 0 ? (
          <>
            <Runner key={run} questions={data.questions} onRetryAll={() => setRun((r) => r + 1)} />
            <CachedNote at={fromCache} onRefresh={() => { setRun((r) => r + 1); void refresh(); }} busy={loading} />
          </>
        ) : (
          data && <p className="py-10 text-center text-sm text-muted">문제로 만들 만한 내용이 부족해요.</p>
        )}
      </StudyState>
    </Modal>
  );
}
