"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, LoaderCircle, Undo2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

export interface ChatEdit {
  heading: string;
  markdown: string;
}
/** 결과물에 적용하고 바꾸기 전 글(되돌리기용)을 돌려준다. 실패하면 던진다. */
export type ApplyEdit = (edit: ChatEdit) => Promise<string>;
export type UndoEdit = (heading: string, before: string) => Promise<void>;

/**
 * 채팅이 낸 "칸 수정안": 고친 글을 보여 주고, 저장된 결과물 화면이면 [결과물에 적용]을 붙인다.
 * 적용하면 바로 되돌리기가 생긴다(잘못 눌러도 원래 글로 돌아간다).
 */
export default function ChatEditCard({ edit, onApply, onUndo }: { edit: ChatEdit; onApply?: ApplyEdit; onUndo?: UndoEdit }) {
  const t = useT();
  const [state, setState] = useState<"idle" | "busy" | "applied" | "undone">("idle");
  const [before, setBefore] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setError(null);
    setState("busy");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("적용하지 못했어요. 잠시 후 다시 시도해 주세요."));
      setState((s) => (s === "busy" ? (before ? "applied" : "idle") : s));
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-border-strong">
      <p className="border-b border-border px-3.5 py-2 text-xs font-semibold text-faint">
        {t("수정안")} · {edit.heading}
      </p>
      <div className="max-h-72 overflow-y-auto px-3.5 py-3 text-[14px] leading-[1.75] [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{edit.markdown}</ReactMarkdown>
      </div>
      {onApply && (
        <div className="flex items-center justify-between gap-3 border-t border-border px-3.5 py-2.5">
          <span className="text-xs text-muted">
            {state === "applied" ? t("결과물에 적용했어요") : state === "undone" ? t("원래 글로 되돌렸어요") : t("누르면 결과물의 이 칸이 이 글로 바뀌어요")}
          </span>
          <div className="flex shrink-0 gap-2">
            {state === "applied" && onUndo && (
              <Button size="sm" onClick={() => run(async () => { await onUndo(edit.heading, before); setState("undone"); })}>
                <Undo2 size={13} strokeWidth={1.8} />
                {t("되돌리기")}
              </Button>
            )}
            {(state === "idle" || state === "undone" || state === "busy") && (
              <Button
                size="sm"
                variant="primary"
                disabled={state === "busy"}
                onClick={() => run(async () => { setBefore(await onApply(edit)); setState("applied"); })}
              >
                {state === "busy" ? <LoaderCircle size={13} className="animate-spin" /> : <Check size={13} strokeWidth={2} />}
                {t("결과물에 적용")}
              </Button>
            )}
          </div>
        </div>
      )}
      {error && <p role="alert" className="px-3.5 pb-2.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
