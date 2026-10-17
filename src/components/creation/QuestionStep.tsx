"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";
import type { PreAnswer, PreQuestion } from "@/lib/questions/questions-pure";

/**
 * 제작 전 질문 한 개를 보여주는 단계. 선택형은 보기를 누르면 바로 다음으로 넘어가고, 직접 입력·AI에게 맡기기·(개인 질문일 때) 나중에 직접 쓰기를
 * 항상 고를 수 있다. 어떤 질문도 학생을 막지 않는다 — "질문 건너뛰고 바로 만들기"가 항상 있다.
 */
export default function QuestionStep({
  question,
  loading,
  index,
  cap,
  modeLabel,
  onAnswer,
  onSkipAll,
}: {
  question: PreQuestion | null;
  loading: boolean;
  index: number;
  cap: number;
  modeLabel: string;
  onAnswer: (a: PreAnswer) => void;
  onSkipAll: () => void;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const [otherOpen, setOtherOpen] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // 새 질문이 오면 입력을 비운다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText("");
    setOtherOpen(false);
  }, [question?.id]);

  useEffect(() => {
    if (otherOpen || question?.kind === "personal") areaRef.current?.focus();
  }, [otherOpen, question?.id, question?.kind]);

  if (loading || !question) {
    return (
      <div role="status" className="flex flex-col items-center gap-4 py-10 text-center">
        <LoaderCircle size={26} strokeWidth={1.6} className="animate-spin text-muted" />
        <div>
          <p className="text-base font-bold">{t("꼭 필요한 것만 확인하고 있어요")}</p>
          <p className="mt-1 text-sm text-muted">{t("질문이 필요 없으면 바로 만들기를 시작해요.")}</p>
        </div>
      </div>
    );
  }

  const personal = question.kind === "personal";
  const answer = (state: PreAnswer["state"], value = "") => onAnswer({ question: question.text, key: question.key, answer: value, state });

  return (
    <div>
      <div className="mb-5 flex items-center justify-between text-xs text-faint">
        <span>{modeLabel}</span>
        <span className="tabular-nums">
          {t("질문 {index} / 최대 {cap}", { index, cap })}
        </span>
      </div>
      <h2 className="text-xl font-bold leading-snug tracking-tight">{question.text}</h2>
      {question.why && <p className="mt-2 text-[13px] leading-relaxed text-muted">{question.why}</p>}

      {!personal && (
        <ul className="mt-5 space-y-2">
          {question.options.map((o) => (
            <li key={o}>
              <button
                onClick={() => answer("answered", o)}
                className="w-full rounded-xl border border-border-strong px-4 py-3.5 text-left text-[14.5px] leading-snug transition-colors hover:border-foreground hover:bg-raised"
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}

      {personal && question.options.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label={t("답변 예시")}>
          {question.options.map((o) => (
            <button
              key={o}
              onClick={() => setText(o)}
              className="rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted transition-colors hover:border-foreground hover:text-foreground"
            >
              {o}
            </button>
          ))}
        </div>
      )}

      {(personal || otherOpen) && (
        <div className="mt-4">
          <label className="sr-only" htmlFor="q-text">
            {t("내 답")}
          </label>
          <textarea
            id="q-text"
            ref={areaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={personal ? t("내 이야기를 한두 문장으로 적어 주세요") : t("직접 적어 주세요")}
            className="w-full resize-none rounded-xl border border-border-strong bg-background px-4 py-3 text-[14.5px] leading-relaxed placeholder:text-faint focus:border-foreground"
          />
          <div className="mt-2 flex justify-end">
            <Button variant="primary" size="md" disabled={!text.trim()} onClick={() => answer("answered", text.trim())}>
              {t("다음")}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-[13px]">
        {!personal && question.allowOther && !otherOpen && (
          <button onClick={() => setOtherOpen(true)} className="font-medium text-muted underline underline-offset-2 transition-colors hover:text-foreground">
            {t("직접 입력하기")}
          </button>
        )}
        {personal ? (
          <button onClick={() => answer("later")} className="font-medium text-muted underline underline-offset-2 transition-colors hover:text-foreground">
            {t("나중에 직접 쓸게요")}
          </button>
        ) : (
          <button onClick={() => answer("delegate")} className="font-medium text-muted underline underline-offset-2 transition-colors hover:text-foreground">
            {t("AI가 알아서 정해 주세요")}
          </button>
        )}
        <button onClick={onSkipAll} className="ml-auto font-medium text-faint transition-colors hover:text-foreground">
          {t("질문 건너뛰고 바로 만들기")}
        </button>
      </div>
    </div>
  );
}
