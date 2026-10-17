"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ImagePlus, LoaderCircle, SendHorizontal, X } from "lucide-react";
import { prepareImage, type PreparedImage } from "@/lib/ui/image";
import type { ChatMessage, useChat } from "./useChat";

type Chat = ReturnType<typeof useChat>;

function Message({ m }: { m: ChatMessage }) {
  if (m.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1.5">
        {m.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.imageUrl} alt="첨부한 안내문" className="max-h-40 rounded-lg border border-border object-contain" />
        )}
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-raised px-4 py-2.5 text-[14px] leading-relaxed">
          {m.content}
        </p>
      </div>
    );
  }
  return (
    <div className="max-w-full">
      <div className="text-[14px] leading-[1.75] [&_a]:underline [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_table]:my-2 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
      </div>
      {m.sources && m.sources.length > 0 && (
        <ol className="mt-3 space-y-1 border-t border-border pt-2.5 text-xs text-muted">
          {m.sources.map((s) => (
            <li key={s.n} className="flex gap-1.5">
              <span className="shrink-0 tabular-nums">[{s.n}]</span>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate underline underline-offset-2 hover:text-foreground">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** 대화 목록 + 입력창. 홈의 고정 입력창(ChatDock)과 과제 화면의 AI 채팅(ChatPanel)이 같이 쓴다. */
export default function ChatView({
  chat,
  placeholder,
  allowImage = false,
  header,
  messagesClassName = "",
  empty,
  disabledReason,
  composerFirst = false,
}: {
  chat: Chat;
  placeholder: string;
  allowImage?: boolean;
  /** 입력창 바로 위(대화 목록 아래)에 끼워 넣을 요소 — 예: 대상 과제 선택. */
  header?: ReactNode;
  messagesClassName?: string;
  /** 대화가 비었을 때 보여줄 안내. */
  empty?: ReactNode;
  disabledReason?: string | null;
  /** true면 입력창이 위, 대화가 그 아래에 펼쳐진다(홈 화면). 기본은 대화 위·입력창 아래(채팅 레일). */
  composerFirst?: boolean;
}) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 대화 목록 안에서만 맨 아래로 내린다(scrollIntoView는 바깥 페이지까지 같이 스크롤해 버린다).
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat.messages.length, chat.busy]);

  function autosize() {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  async function submit() {
    const value = text.trim();
    if (!value || chat.busy || disabledReason) return;
    const img = image;
    setText("");
    setImage(null);
    requestAnimationFrame(autosize);
    await chat.send(value, img);
  }

  async function onPick(file: File | null) {
    setImageError(null);
    if (!file) return;
    try {
      const prepared = await prepareImage(file);
      setImage((old) => {
        if (old) URL.revokeObjectURL(old.previewUrl);
        return prepared;
      });
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "이미지를 불러오지 못했어요.");
    }
  }

  const hasMessages = chat.messages.length > 0;

  const messagesBlock = (hasMessages || empty) && (
        <div ref={listRef} className={`min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-4 ${messagesClassName}`} aria-live="polite">
          {!hasMessages && empty}
          {chat.messages.map((m) => (
            <Message key={m.id} m={m} />
          ))}
          {chat.busy && (
            <p role="status" className="flex items-center gap-2 text-[13px] text-muted">
              <LoaderCircle size={14} strokeWidth={1.8} className="animate-spin" />
              답을 쓰는 중이에요
            </p>
          )}
          {chat.error && (
            <p role="alert" className="rounded-xl border border-danger/50 px-3.5 py-2.5 text-[13px] text-danger">
              {chat.error}
            </p>
          )}
        </div>
      );
  const composerBlock = (
    <>
        <div className="rounded-2xl border border-border-strong bg-surface transition-colors focus-within:border-foreground">
          {image && (
            <div className="flex items-center gap-2 px-3 pt-3">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.previewUrl} alt="첨부할 안내문 미리보기" className="h-14 w-14 rounded-lg border border-border object-cover" />
                <button
                  onClick={() => setImage(null)}
                  aria-label="첨부 사진 지우기"
                  className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-border-strong bg-surface text-muted hover:text-foreground"
                >
                  <X size={11} strokeWidth={2} />
                </button>
              </div>
              <p className="text-xs text-muted">이 사진을 안내문으로 보고 답해요</p>
            </div>
          )}
          <div className="flex items-end gap-1.5 p-2">
            {allowImage && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  aria-label="안내문 사진 첨부"
                  title="안내문 사진 첨부"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-raised hover:text-foreground"
                >
                  <ImagePlus size={19} strokeWidth={1.7} />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="안내문 사진 선택"
                  onChange={(e) => {
                    void onPick(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </>
            )}
            <label className="min-w-0 flex-1">
              <span className="sr-only">질문 입력</span>
              <textarea
                ref={areaRef}
                value={text}
                rows={1}
                onChange={(e) => {
                  setText(e.target.value);
                  autosize();
                }}
                onKeyDown={(e) => {
                  // 한글 입력 중(조합 중)의 Enter는 보내기가 아니라 글자 확정이다.
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                placeholder={disabledReason ?? placeholder}
                disabled={!!disabledReason}
                className="max-h-[140px] w-full resize-none bg-transparent px-2 py-2.5 text-[14px] leading-relaxed placeholder:text-faint disabled:cursor-not-allowed"
              />
            </label>
            <button
              onClick={() => void submit()}
              disabled={!text.trim() || chat.busy || !!disabledReason}
              aria-label="보내기"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
            >
              <SendHorizontal size={18} strokeWidth={1.9} />
            </button>
          </div>
        </div>
        {imageError && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {imageError}
          </p>
        )}
    </>
  );

  return (
    <div className="flex min-h-0 flex-col">
      {composerFirst ? (
        <>
          {composerBlock}
          {header && <div className="mt-2.5">{header}</div>}
          {messagesBlock && <div className="mt-4">{messagesBlock}</div>}
        </>
      ) : (
        <>
          {messagesBlock}
          {header}
          {composerBlock}
        </>
      )}
    </div>
  );
}
