"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, GraduationCap, RotateCcw, X } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import StudyState from "./StudyState";
import SkeletonSheet from "./SkeletonSheet";
import type { StudySummaryData } from "./SummaryModal";
import { loadLocal, saveLocal, useStudyData, type StudyRef } from "./useStudyData";
import { useT } from "@/lib/i18n";
import { loadStudyPrefs, prefsSignature } from "@/lib/study/prefs";
import { chipBank, firstLetterHint, quizIndexes, readiness, sameKeyword, sameWord, scoreWrite, segmentLine, type SkeletonBox } from "@/lib/study/memo-skeleton";

// 단계: 0 시작 화면 → 1 보기에서 고르기 → 2 첫 글자 보고 입력 → 3 칸 이름만 보고 백지 → 4 결과
// 퀴즈는 1·2단계, 암기는 3단계(와 뼈대 한 장)를 쓴다. 각 단계는 칸을 한 번씩 돌고, 막힌 칸은 그 단계 끝에 한 번 더 나온다.
type Stage = 0 | 1 | 2 | 3 | 4;

const STAGE_NAME: Record<1 | 2 | 3, string> = { 1: "보기에서 고르기", 2: "첫 글자 보고 쓰기", 3: "백지에 떠올리기" };

/** 한 칸 문제의 결과: 모두 맞았는가. */
type Done = (passed: boolean, hit?: number) => void;

function ChooseStep({ boxes, index, onDone }: { boxes: SkeletonBox[]; index: number; onDone: Done }) {
  const t = useT();
  const b = boxes[index];
  const segs = useMemo(() => segmentLine(b.line, b.keywords), [b]);
  const blanks = segs.filter((s) => s.blank !== undefined).map((s) => s.text);
  const bank = useMemo(() => chipBank(boxes, index, 2), [boxes, index]);
  const [filled, setFilled] = useState<string[]>([]);
  const [used, setUsed] = useState<Set<number>>(new Set());
  const [wrong, setWrong] = useState<number | null>(null);
  const [missed, setMissed] = useState(false);
  const done = filled.length >= blanks.length;

  function pick(i: number) {
    if (done || used.has(i)) return;
    if (sameWord(bank[i], blanks[filled.length])) {
      setFilled((f) => [...f, bank[i]]);
      setUsed((u) => new Set(u).add(i));
      setWrong(null);
    } else {
      setWrong(i);
      setMissed(true);
    }
  }

  let blankNo = -1;
  return (
    <div>
      <p className="text-xs font-semibold text-faint">{b.box}</p>
      <p className="mt-2 text-lg font-bold leading-[2.1] tracking-tight">
        {segs.map((s, i) => {
          if (s.blank === undefined) return <span key={i}>{s.text}</span>;
          blankNo += 1;
          const text = filled[blankNo];
          return (
            <span
              key={i}
              className={["mx-0.5 inline-block min-w-[3.5rem] rounded-md border-b-2 px-1.5 text-center", text ? "border-foreground bg-surface" : "border-border-strong text-transparent"].join(" ")}
            >
              {text ?? "○○"}
            </span>
          );
        })}
      </p>
      <p className="mt-5 text-xs text-faint">{t("빈칸에 들어갈 말을 순서대로 눌러 보세요")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {bank.map((k, i) => (
          <button
            key={i}
            onClick={() => pick(i)}
            disabled={used.has(i) || done}
            className={[
              "h-10 rounded-full px-4 text-[14px] font-semibold transition-colors disabled:opacity-30",
              wrong === i ? "bg-danger/15 text-danger" : "bg-raised hover:bg-border-strong",
            ].join(" ")}
          >
            {k}
          </button>
        ))}
      </div>
      {wrong !== null && !done && <p className="mt-3 text-xs text-danger">{t("그 순서가 아니에요. 다시 골라 보세요.")}</p>}
      <div className="mt-6 flex justify-end">
        <Button variant="primary" disabled={!done} onClick={() => onDone(!missed)}>
          {t("다음")} <ArrowRight size={14} strokeWidth={1.8} />
        </Button>
      </div>
    </div>
  );
}

function TypeStep({ boxes, index, onDone }: { boxes: SkeletonBox[]; index: number; onDone: Done }) {
  const t = useT();
  const b = boxes[index];
  const segs = useMemo(() => segmentLine(b.line, b.keywords), [b]);
  const blanks = segs.filter((s) => s.blank !== undefined);
  const [vals, setVals] = useState<string[]>(() => blanks.map(() => ""));
  const [checked, setChecked] = useState(false);
  const ok = blanks.map((s, i) => sameKeyword(vals[i] ?? "", s.text));
  const allOk = ok.every(Boolean);

  let n = -1;
  return (
    <div>
      <p className="text-xs font-semibold text-faint">{b.box}</p>
      <p className="mt-2 text-lg font-bold leading-[2.4] tracking-tight">
        {segs.map((s, i) => {
          if (s.blank === undefined) return <span key={i}>{s.text}</span>;
          n += 1;
          const k = n;
          return (
            <input
              key={i}
              value={vals[k]}
              disabled={checked}
              onChange={(e) => setVals((v) => v.map((x, j) => (j === k ? e.target.value : x)))}
              placeholder={firstLetterHint(s.text)}
              aria-label={t("빈칸 {n}", { n: k + 1 })}
              size={Math.max(4, Array.from(s.text).length + 1)}
              className={[
                "mx-0.5 rounded-md border-b-2 bg-surface px-1.5 text-center text-[16px] font-bold outline-none placeholder:font-medium placeholder:text-faint",
                checked ? (ok[k] ? "border-foreground" : "border-danger text-danger") : "border-border-strong focus:border-foreground",
              ].join(" ")}
            />
          );
        })}
      </p>
      {checked && !allOk && (
        <p className="mt-3 text-sm text-muted">
          {t("정답")}: <b className="text-foreground">{blanks.map((s) => s.text).join(" · ")}</b>
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        {!checked ? (
          <Button variant="primary" onClick={() => setChecked(true)} disabled={vals.some((v) => !v.trim())}>
            {t("확인")}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => onDone(allOk)}>
            {t("다음")} <ArrowRight size={14} strokeWidth={1.8} />
          </Button>
        )}
      </div>
    </div>
  );
}

/** 핵심어가 없는 칸(글의 목적·예상 독자 같은 설명 칸): 칸 이름만 보고 떠올린 뒤 정리된 줄을 보고 스스로 맞았는지 누른다. */
function RecallStep({ boxes, index, onDone }: { boxes: SkeletonBox[]; index: number; onDone: Done }) {
  const t = useT();
  const b = boxes[index];
  const [shown, setShown] = useState(false);
  return (
    <div>
      <p className="text-xs font-semibold text-faint">{t("칸 이름")}</p>
      <p className="mt-1 text-xl font-bold tracking-tight">{b.box}</p>
      <p className="mt-4 text-sm text-muted">{t("이 칸에 무엇을 쓸지 떠올려 보세요")}</p>
      {shown && <p className="mt-4 rounded-xl bg-surface px-4 py-3.5 text-[15px] leading-[1.8]">{b.line}</p>}
      <div className="mt-5 flex justify-end gap-2">
        {!shown ? (
          <Button variant="primary" onClick={() => setShown(true)}>
            {t("답 확인")}
          </Button>
        ) : (
          <>
            <Button onClick={() => onDone(false, 0)}>
              <X size={15} strokeWidth={1.9} />
              {t("헷갈려요")}
            </Button>
            <Button variant="primary" onClick={() => onDone(true, 1)}>
              <Check size={15} strokeWidth={2} />
              {t("알아요")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function WriteStep({ boxes, index, retry, onDone }: { boxes: SkeletonBox[]; index: number; retry: boolean; onDone: Done }) {
  const t = useT();
  const b = boxes[index];
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ hit: string[]; miss: string[] } | null>(null);
  return (
    <div>
      <p className="text-xs font-semibold text-faint">{t("칸 이름")}</p>
      <p className="mt-1 text-xl font-bold tracking-tight">{b.box}</p>
      <textarea
        value={text}
        disabled={!!result}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={t("이 칸에 쓸 핵심어와 내용을 떠올려 써 보세요 (시험장에서 쓰듯이)")}
        className="mt-4 w-full resize-none rounded-xl border border-border-strong bg-transparent px-4 py-3 text-[15px] leading-relaxed outline-none focus:border-foreground"
      />
      {result && (
        <div className="mt-3 space-y-1.5 text-sm">
          <p className="flex flex-wrap items-center gap-1.5">
            {result.hit.map((k) => (
              <span key={k} className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 font-semibold">
                <Check size={12} strokeWidth={2.2} />
                {k}
              </span>
            ))}
            {result.miss.map((k) => (
              <span key={k} className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2.5 py-1 font-semibold text-danger">
                <X size={12} strokeWidth={2.2} />
                {k}
              </span>
            ))}
          </p>
          <p className="leading-relaxed text-muted">{b.line}</p>
        </div>
      )}
      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-xs text-faint">{retry ? t("한 번 더 도전") : ""}</span>
        {!result ? (
          <Button variant="primary" onClick={() => setResult(scoreWrite(text, b.keywords))} disabled={!text.trim()}>
            {t("확인")}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => onDone(result.miss.length === 0, result.hit.length)}>
            {t("다음")} <ArrowRight size={14} strokeWidth={1.8} />
          </Button>
        )}
      </div>
    </div>
  );
}

type Mode = "quiz" | "memorize";

const MODE: Record<Mode, { title: string; stages: (1 | 2 | 3)[] }> = {
  quiz: { title: "퀴즈", stages: [1, 2] },
  memorize: { title: "암기", stages: [3] },
};

/**
 * 뼈대(칸 순서 + 칸마다 핵심어)를 가리는 양을 늘려 가며 외우는 사다리. 요약이 저장돼 있으면 그것을 쓰고 없으면 요약부터 만든다(별도 모델 호출 없음).
 * - 퀴즈: 빈칸 고르기 → 첫 글자 보고 쓰기(2단계). 결과는 "몇 칸을 한 번에 맞혔나".
 * - 암기: 뼈대 한 장을 보고 → 칸 이름만 보고 백지에 떠올리기. 결과는 준비도 %(핵심어 적중 추정).
 */
function Ladder({
  mode,
  studyRef,
  onClose,
  onOpenExam,
  onOpenMemorize,
}: {
  mode: Mode;
  studyRef: StudyRef;
  onClose: () => void;
  onOpenExam?: () => void;
  onOpenMemorize?: () => void;
}) {
  const t = useT();
  const { title, stages } = MODE[mode];
  const [prefs] = useState(() => loadStudyPrefs());
  // reuse=true: 어떤 설정으로 만든 요약이든 저장돼 있으면 그대로 쓴다.
  const { data, error, loading, refresh } = useStudyData<StudySummaryData>(studyRef, "summary", { prefs: prefs.summary }, Infinity, {
    sig: prefsSignature(prefs.summary),
    reuse: true,
  });
  const boxes = useMemo(() => data?.skeleton ?? [], [data]);
  // 퀴즈(빈칸)는 핵심어 있는 칸만, 암기(백지 떠올리기)는 설명하는 칸까지 모든 칸을 한 번씩 돈다.
  const practiceIndexes = () => (mode === "memorize" ? boxes.map((_, i) => i) : quizIndexes(boxes));

  // "외웠어요" 체크는 칸 이름으로 브라우저에 저장한다 — 창을 닫았다 열어도 이어지고, 결과물이 고쳐지면 clearSavedStudy가 같이 지운다.
  const memoKey = `${studyRef.key ?? `${studyRef.kind}:${studyRef.id}`}:memo-done`;
  const [done, setDone] = useState<Set<string>>(() => new Set(loadLocal<string[]>(memoKey) ?? []));
  const [onlyOpen, setOnlyOpen] = useState(false);
  const saveDone = (next: Set<string>) => {
    setDone(next);
    saveLocal(memoKey, [...next]);
  };
  const toggleDone = (box: string) => {
    const next = new Set(done);
    if (next.has(box)) next.delete(box);
    else next.add(box);
    saveDone(next);
  };

  const [stage, setStage] = useState<Stage>(0);
  const [queue, setQueue] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  const retried = useRef(new Set<number>());
  // 백지 단계에서 **처음 쓴 답**의 적중(준비도 계산용). 헷갈린 칸 = 어느 단계에서든 처음 시도에 막힌 칸.
  const first = useRef<Record<number, { hit: number; total: number }>>({});
  const weak = useRef<Set<number>>(new Set());
  const tried = useRef(new Set<string>());
  // 이번 회차가 도는 칸들(헷갈린 칸만 다시 할 때는 일부).
  const scope = useRef<number[] | null>(null);
  const runSize = useRef(0);

  function begin(s: 1 | 2 | 3, only?: number[]) {
    if (only) scope.current = only;
    else if (s === stages[0]) scope.current = null;
    // 핵심어가 없는 칸(결론 등)은 빈칸 문제가 안 되므로 건너뛴다(칸 순서에는 남아 있다).
    const order = scope.current ?? practiceIndexes();
    retried.current = new Set();
    if (s === stages[0]) {
      for (const i of order) {
        delete first.current[i];
        weak.current.delete(i);
        stages.forEach((st) => tried.current.delete(`${st}:${i}`));
      }
      runSize.current = order.length;
    }
    setQueue(order);
    setPos(0);
    setStage(s);
  }

  const onDone: Done = (passed, hit) => {
    const i = queue[pos];
    const key = `${stage}:${i}`;
    if (!tried.current.has(key)) {
      tried.current.add(key);
      if (!passed) weak.current.add(i);
      // 핵심어 없는 칸은 맞았는지(1/1) 아닌지(0/1)로 준비도에 센다.
      if (stage === 3) first.current[i] = boxes[i].keywords.length ? { hit: hit ?? (passed ? boxes[i].keywords.length : 0), total: boxes[i].keywords.length } : { hit: passed ? 1 : 0, total: 1 };
    }
    // 막힌 칸은 이 단계 끝에 한 번 더 나온다.
    if (!passed && !retried.current.has(i)) {
      retried.current.add(i);
      setQueue((q) => [...q, i]);
    }
    setPos((p) => p + 1);
  };

  // 큐를 다 돌았으면 다음 단계로(재도전으로 길어진 큐도 끝까지 돈다).
  useEffect(() => {
    if (stage < 1 || stage > 3 || queue.length === 0 || pos < queue.length) return;
    const next = stages[stages.indexOf(stage as 1 | 2 | 3) + 1];
    if (next) begin(next);
    else {
      // 암기 연습이 끝나면 이번에 처음부터 다 떠올린 칸은 "외움"으로, 막힌 칸은 "못 외움"으로 바꾼다.
      if (mode === "memorize") {
        const run = scope.current ?? practiceIndexes();
        const nextDone = new Set(done);
        for (const i of run) {
          if (weak.current.has(i)) nextDone.delete(boxes[i].box);
          else nextDone.add(boxes[i].box);
        }
        saveDone(nextDone);
      }
      setStage(4);
    }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const hasSkeleton = practiceIndexes().length > 0;
  const current = stage >= 1 && stage <= 3 ? queue[pos] : undefined;
  const stageNo = stage >= 1 && stage <= 3 ? stages.indexOf(stage as 1 | 2 | 3) + 1 : 0;
  const score = readiness(Object.values(first.current));
  const solved = Math.max(0, runSize.current - weak.current.size);

  return (
    <Modal title={t(title)} onClose={onClose} width={640} busy={loading}>
      <StudyState loading={loading} error={error} onRetry={refresh} loadingText={t("외울 뼈대를 만들고 있어요...")}>
        {data && !hasSkeleton && (
          <div className="py-10 text-center">
            <p className="text-sm leading-relaxed text-muted">{t("이 요약에는 암기 뼈대가 없어요. 새로 만들면 외울 것만 뽑아 줘요.")}</p>
            <Button className="mt-4" variant="primary" onClick={refresh}>
              {t("새로 만들기")}
            </Button>
          </div>
        )}

        {data && hasSkeleton && stage === 0 && (
          <div>
            {mode === "quiz" ? (
              <>
                <p className="text-base font-bold leading-snug">{t("빈칸 → 첫 글자, 2단계로 풀어요")}</p>
                <ol className="mt-3 space-y-1.5 text-sm leading-relaxed text-muted">
                  <li>1. {t(STAGE_NAME[1])}</li>
                  <li>2. {t(STAGE_NAME[2])}</li>
                </ol>
                <p className="mt-3 text-xs text-faint">{t("시험장에서 문장은 이해한 대로 쓰면 돼요. 핵심어와 순서만 맞히면 돼요.")}</p>
              </>
            ) : (
              <>
                <div className="mb-4 flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums">
                    {t("외움 {done}/{total}", { done: boxes.filter((b) => done.has(b.box)).length, total: boxes.length })}
                  </span>
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={boxes.length} aria-valuenow={boxes.filter((b) => done.has(b.box)).length}>
                    <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${(boxes.filter((b) => done.has(b.box)).length / Math.max(1, boxes.length)) * 100}%` }} />
                  </div>
                  <Button size="sm" variant={onlyOpen ? "primary" : "secondary"} onClick={() => setOnlyOpen((v) => !v)}>
                    {t("못 외운 것만")}
                  </Button>
                </div>
                <p className="mb-3 text-xs text-faint">{t("시험장에서 문장은 이해한 대로 쓰면 돼요. 외운 칸은 체크해 두세요.")}</p>
                <SkeletonSheet boxes={boxes} mnemonic={prefs.memorize.mnemonic} checked={done} onToggle={toggleDone} onlyUnchecked={onlyOpen} />
                {onlyOpen && boxes.every((b) => done.has(b.box)) && <p className="mt-3 text-center text-sm text-muted">{t("못 외운 칸이 없어요!")}</p>}
              </>
            )}
            <div className="mt-6 flex justify-end">
              <Button
                variant="primary"
                onClick={() => {
                  // "못 외운 것만"을 켰으면 체크 안 된 칸만 연습한다.
                  const open = practiceIndexes().filter((i) => !done.has(boxes[i].box));
                  if (mode === "memorize" && onlyOpen && open.length > 0) begin(stages[0], open);
                  else begin(stages[0]);
                }}
              >
                {mode === "quiz" ? t("퀴즈 시작") : t("백지 연습 시작")} <ArrowRight size={14} strokeWidth={1.8} />
              </Button>
            </div>
          </div>
        )}

        {data && hasSkeleton && current !== undefined && (
          <div>
            <div className="mb-5 flex items-center justify-between text-xs text-faint">
              <span className="font-semibold">
                {stages.length > 1 ? `${stageNo} / ${stages.length} · ` : ""}
                {t(STAGE_NAME[stage as 1 | 2 | 3])}
              </span>
              <span className="tabular-nums">
                {Math.min(pos + 1, queue.length)} / {queue.length}
              </span>
            </div>
            <div className="mb-5 h-1 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={Math.min(pos, queue.length)}>
              <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${(Math.min(pos, queue.length) / Math.max(1, queue.length)) * 100}%` }} />
            </div>
            <div key={`${stage}-${pos}`}>
              {stage === 1 && <ChooseStep boxes={boxes} index={current} onDone={onDone} />}
              {stage === 2 && <TypeStep boxes={boxes} index={current} onDone={onDone} />}
              {stage === 3 &&
                (boxes[current].keywords.length > 0 ? (
                  <WriteStep boxes={boxes} index={current} retry={pos >= runSize.current} onDone={onDone} />
                ) : (
                  <RecallStep boxes={boxes} index={current} onDone={onDone} />
                ))}
            </div>
          </div>
        )}

        {data && hasSkeleton && stage === 4 && (
          <div className="py-6 text-center">
            {mode === "memorize" ? (
              <>
                <p className="text-xs font-semibold text-faint">{t("지금 시험을 보면 (추정)")}</p>
                <p className="mt-1 text-5xl font-bold tabular-nums">
                  {score}
                  <span className="text-xl font-medium text-faint">%</span>
                </p>
                <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed text-faint">{t("이 숫자는 핵심어를 얼마나 떠올렸는지로 낸 추정이에요. 실제 채점 점수와는 달라요.")}</p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold text-faint">{t("한 번에 맞힌 칸")}</p>
                <p className="mt-1 text-5xl font-bold tabular-nums">
                  {solved}
                  <span className="text-xl font-medium text-faint"> / {runSize.current}</span>
                </p>
              </>
            )}
            {weak.current.size > 0 ? (
              <p className="mt-5 text-sm text-muted">
                {t("헷갈린 칸")}: <b className="text-foreground">{[...weak.current].map((i) => boxes[i].box).join(" · ")}</b>
              </p>
            ) : (
              <p className="mt-5 text-sm text-muted">{t("전부 떠올렸어요!")}</p>
            )}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {weak.current.size > 0 && (
                <Button variant="primary" onClick={() => begin(stages[0], [...weak.current])}>
                  <RotateCcw size={15} strokeWidth={1.8} />
                  {t("헷갈린 칸만 다시")}
                </Button>
              )}
              <Button onClick={() => { weak.current = new Set(); mode === "memorize" ? setStage(0) : begin(stages[0]); }}>
                {mode === "memorize" ? t("뼈대 다시 보기") : t("처음부터 다시")}
              </Button>
              {mode === "quiz" && onOpenMemorize && (
                <Button variant={weak.current.size > 0 ? "secondary" : "primary"} onClick={onOpenMemorize}>
                  {t("암기 연습하기")}
                </Button>
              )}
              {mode === "memorize" && onOpenExam && (
                <Button variant={weak.current.size > 0 ? "secondary" : "primary"} onClick={onOpenExam}>
                  <GraduationCap size={15} strokeWidth={1.8} />
                  {t("가상 시험 보기")}
                </Button>
              )}
            </div>
          </div>
        )}
      </StudyState>
    </Modal>
  );
}

export default function QuizModal(props: { studyRef: StudyRef; onClose: () => void; onOpenMemorize?: () => void }) {
  return <Ladder mode="quiz" {...props} />;
}

export function MemorizeModal(props: { studyRef: StudyRef; onClose: () => void; onOpenExam?: () => void }) {
  return <Ladder mode="memorize" {...props} />;
}
