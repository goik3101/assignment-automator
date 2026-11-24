"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { REPLY_MAX } from "@/lib/feedback/identity";

// 관리자 화면의 답변 칸. 저장하면 그 피드백을 보낸 사용자의 문의·피드백 화면에 "개발자 답변"으로 뜬다. 빈 글로 저장하면 답변을 지운다.
export default function FeedbackReply({ id, initial }: { id: string; initial: string | null }) {
  const router = useRouter();
  const [text, setText] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = text.trim() !== (initial ?? "").trim();

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/feedback/${id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: text }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "저장하지 못했어요.");
      setMsg(text.trim() ? "답변을 저장했어요." : "답변을 지웠어요.");
      router.refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <label htmlFor={`reply-${id}`} className="text-xs font-semibold text-muted">
        개발자 답변
      </label>
      <textarea
        id={`reply-${id}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={REPLY_MAX}
        rows={3}
        placeholder="이 사용자의 문의·피드백 화면에 그대로 보여요"
        className="mt-1.5 w-full resize-none rounded-xl border border-border-strong bg-background px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-faint focus:border-foreground"
      />
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <p role="status" className="text-xs text-muted">
          {msg}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="inline-flex h-8 items-center rounded-full bg-foreground px-4 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {initial ? "답변 수정" : "답변 보내기"}
        </button>
      </div>
    </div>
  );
}
