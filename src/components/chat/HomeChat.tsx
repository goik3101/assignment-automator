"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, FilePlus2, Sparkles, SquarePen } from "lucide-react";
import { useAuth } from "@/lib/supabase/use-auth";
import ChatView from "./ChatView";
import { useChat, type ChatContextRef } from "./useChat";

interface PickItem {
  key: string;
  ref: NonNullable<ChatContextRef>;
  title: string;
  subject: string;
}

/**
 * 홈 위쪽(사진 업로드·텍스트로 붙여넣기 버튼 바로 아래)의 입력창. 새 안내문(사진·글)을 붙여서 바로 질문하거나, "질문할 과제"를 골라 이미 만든 과제에 대해 묻는다.
 * 대화가 시작되면 입력창 위로 대화창이 펼쳐진다. 로그인한 사용자만 쓸 수 있다.
 */
export default function HomeChat() {
  const { user } = useAuth();
  const chat = useChat(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [items, setItems] = useState<PickItem[] | null>(null);
  const [target, setTarget] = useState<PickItem | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen || items || !user) return;
    const load = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([load("/api/histories"), load("/api/learning/sessions")]).then(([h, l]) => {
      const list: PickItem[] = [
        ...((h?.histories ?? []) as { id: string; title: string | null; subject: string }[]).map((x) => ({
          key: `h-${x.id}`,
          ref: { kind: "history" as const, id: x.id },
          title: x.title || x.subject,
          subject: x.subject,
        })),
        ...((l?.sessions ?? []) as { id: string; title: string; subject: string }[]).map((x) => ({
          key: `l-${x.id}`,
          ref: { kind: "learning" as const, id: x.id },
          title: x.title,
          subject: x.subject,
        })),
      ];
      setItems(list);
    });
  }, [pickerOpen, items, user]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPickerOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [pickerOpen]);

  function choose(next: PickItem | null) {
    setPickerOpen(false);
    if ((next?.key ?? null) === (target?.key ?? null)) return;
    chat.reset();
    setTarget(next);
    chat.setContext(next?.ref ?? null);
  }

  const hasMessages = chat.messages.length > 0;

  const picker = (
    <div ref={pickerRef} className="relative flex items-center gap-2">
      <button
        onClick={() => setPickerOpen((v) => !v)}
        aria-expanded={pickerOpen}
        aria-haspopup="listbox"
        className="inline-flex h-8 max-w-[260px] items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2.5 text-[12.5px] font-semibold transition-colors hover:border-foreground"
      >
        {target ? (
          target.ref.kind === "learning" ? <BookOpen size={13} strokeWidth={1.8} className="shrink-0" /> : <Sparkles size={13} strokeWidth={1.8} className="shrink-0" />
        ) : (
          <FilePlus2 size={13} strokeWidth={1.8} className="shrink-0" />
        )}
        <span className="truncate">{target ? target.title : "새 안내문으로 질문"}</span>
        <ChevronDown size={13} strokeWidth={1.8} className="shrink-0 text-muted" />
      </button>
      {hasMessages && (
        <button
          onClick={() => {
            chat.reset();
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-muted transition-colors hover:bg-raised hover:text-foreground"
        >
          <SquarePen size={13} strokeWidth={1.8} />
          새 대화
        </button>
      )}
      {pickerOpen && (
        <ul
          role="listbox"
          aria-label="질문할 과제"
          className="absolute bottom-10 left-0 z-30 max-h-64 w-72 overflow-y-auto rounded-xl border border-border-strong bg-surface p-1 shadow-xl"
        >
          <li>
            <button
              role="option"
              aria-selected={!target}
              onClick={() => choose(null)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-raised"
            >
              <FilePlus2 size={14} strokeWidth={1.7} className="shrink-0 text-muted" />
              <span className="flex-1 truncate">새 안내문으로 질문</span>
              {!target && <Check size={14} strokeWidth={2} />}
            </button>
          </li>
          {items === null && <li className="px-2.5 py-2 text-xs text-muted">불러오는 중...</li>}
          {items?.length === 0 && <li className="px-2.5 py-2 text-xs text-muted">아직 만든 과제가 없어요.</li>}
          {items?.map((it) => (
            <li key={it.key}>
              <button
                role="option"
                aria-selected={target?.key === it.key}
                onClick={() => choose(it)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-raised"
              >
                {it.ref.kind === "learning" ? (
                  <BookOpen size={14} strokeWidth={1.7} className="shrink-0 text-muted" />
                ) : (
                  <Sparkles size={14} strokeWidth={1.7} className="shrink-0 text-muted" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{it.title}</span>
                  <span className="block truncate text-[11px] text-faint">{it.subject}</span>
                </span>
                {target?.key === it.key && <Check size={14} strokeWidth={2} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <section aria-label="AI에게 질문하기" className="w-full max-w-2xl">
      <ChatView
        chat={chat}
        composerFirst
        allowImage={!target}
        placeholder={target ? `“${target.title}”에 대해 무엇이든 물어보세요` : "무엇이든 물어보기"}
        header={picker}
        messagesClassName="max-h-[52vh] rounded-2xl border border-border bg-surface p-4"
        disabledReason={user ? null : "로그인하면 질문할 수 있어요"}
      />
    </section>
  );
}
