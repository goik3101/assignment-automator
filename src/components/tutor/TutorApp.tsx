"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LoaderCircle, Plus, SendHorizontal, X } from "lucide-react";
import { Message } from "@/components/chat/ChatView";
import type { ChatMessage } from "@/components/chat/useChat";
import StudyRail from "@/components/study/StudyRail";
import { useAuth } from "@/lib/supabase/use-auth";
import { useT } from "@/lib/i18n";
import { prepareImage, type PreparedImage } from "@/lib/ui/image";
import { notifyTutorUpdated } from "@/lib/ui/tutor-events";

const CHIPS = ["수행평가 근거 6가지랑 개요 써줘", "이 글 자연스럽게 다듬어줘", "최신 정보 검색해서 알려줘"];

let counter = 0;
const nextId = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

/**
 * AI 튜터: 수행평가 내용을 글로 설명하거나 사진을 올리면 튜터가 필요한 것만 되묻고 글(근거·개요·초안)을 써 준다.
 * 대화는 서버에 저장되고(왼쪽 작업 목록), 대화가 시작되면 오른쪽에 요약·플래시카드·퀴즈·가상 시험 도구가 붙는다.
 * initialId가 있으면 저장된 대화를 불러온다. 처음 보낸 메시지로 대화가 만들어지면 새로고침 없이 주소만 /tutor/<id>로 바꾼다.
 */
export default function TutorApp({ initialId }: { initialId?: string }) {
  const t = useT();
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const [conversationId, setConversationId] = useState<string | null>(initialId ?? null);
  const [title, setTitle] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(!!initialId);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const idRef = useRef(conversationId);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const loginNeeded = !authLoading && !user;

  useEffect(() => {
    idRef.current = conversationId;
  }, [conversationId]);

  // 저장된 대화 불러오기
  useEffect(() => {
    if (!initialId || !user) return;
    let cancelled = false;
    fetch(`/api/tutor/conversations/${initialId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("not found");
        return (await res.json()) as { title: string; messages: { id: string; role: "user" | "assistant"; content: string; sources?: ChatMessage["sources"]; question?: ChatMessage["question"] }[] };
      })
      .then((data) => {
        if (cancelled) return;
        setTitle(data.title);
        setMessages(data.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, sources: m.sources, question: m.question })));
      })
      .catch(() => !cancelled && setNotFound(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [initialId, user]);

  // 사이드바 "새 대화"로 /tutor에 돌아오면(주소만 /tutor/<id>로 바뀌어 있던 같은 화면) 비운다.
  useEffect(() => {
    if (pathname === "/tutor" && idRef.current && !initialId) {
      setConversationId(null);
      setTitle("");
      setMessages([]);
      setError(null);
      setText("");
      setImage(null);
    }
  }, [pathname, initialId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  const autosize = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, []);

  const send = useCallback(
    async (raw: string, img: PreparedImage | null) => {
      const content = raw.trim();
      if (!content || busy || loginNeeded) return;
      setError(null);
      setBusy(true);
      const userMsg: ChatMessage = { id: nextId(), role: "user", content, imageUrl: img?.previewUrl };
      setMessages((prev) => [...prev, userMsg]);
      try {
        const res = await fetch("/api/tutor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: idRef.current ?? undefined,
            message: content,
            image: img ? { base64: img.base64, mimeType: img.mimeType } : undefined,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          conversationId?: string;
          reply?: string;
          sources?: ChatMessage["sources"];
          question?: ChatMessage["question"];
        };
        if (!res.ok || !data.reply || !data.conversationId) throw new Error(data.error ?? t("답변을 받지 못했어요."));
        setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: data.reply!, sources: data.sources, question: data.question ?? null }]);
        if (!idRef.current) {
          idRef.current = data.conversationId;
          setConversationId(data.conversationId);
          setTitle(content.split(/\r?\n/)[0].slice(0, 36));
          window.history.replaceState(null, "", `/tutor/${data.conversationId}`);
        }
        notifyTutorUpdated();
      } catch (err) {
        // 서버에 저장되지 않았으니 방금 보낸 메시지를 거두고 입력창에 되돌려 다시 보낼 수 있게 한다.
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setText(content);
        if (img) setImage(img);
        setError(err instanceof Error ? err.message : t("답변을 받지 못했어요. 잠시 후 다시 시도해 주세요."));
      } finally {
        setBusy(false);
      }
    },
    [busy, loginNeeded, t]
  );

  function submit() {
    if (!text.trim() || busy || loginNeeded) return;
    const value = text;
    const img = image;
    setText("");
    setImage(null);
    requestAnimationFrame(autosize);
    void send(value, img);
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
      setImageError(err instanceof Error ? t(err.message) : t("이미지를 불러오지 못했어요."));
    }
  }

  const hasMessages = messages.length > 0;
  const last = messages[messages.length - 1];
  const pendingQuestion = !busy && last?.role === "assistant" && last.question ? last.question : null;
  const canStudy = !!conversationId && messages.some((m) => m.role === "assistant");

  const composer = (
    <div>
      <div className="rounded-[28px] bg-surface transition-shadow focus-within:shadow-[0_0_0_1.5px_var(--foreground)]">
        {image && (
          <div className="flex items-center gap-2 px-4 pt-3">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.previewUrl} alt={t("첨부할 안내문 미리보기")} className="h-14 w-14 rounded-lg border border-border object-cover" />
              <button
                onClick={() => setImage(null)}
                aria-label={t("첨부 사진 지우기")}
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-border-strong bg-surface text-muted hover:text-foreground"
              >
                <X size={11} strokeWidth={2} />
              </button>
            </div>
            <p className="text-xs text-muted">{t("이 사진을 안내문으로 보고 답해요")}</p>
          </div>
        )}
        <div className="flex items-end gap-1.5 p-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={loginNeeded}
            aria-label={t("안내문 사진 첨부")}
            title={t("안내문 사진 첨부")}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-raised hover:text-foreground disabled:opacity-40"
          >
            <Plus size={20} strokeWidth={1.7} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label={t("안내문 사진 선택")}
            onChange={(e) => {
              void onPick(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <label className="min-w-0 flex-1">
            <span className="sr-only">{t("질문 입력")}</span>
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
                  submit();
                }
              }}
              placeholder={loginNeeded ? t("로그인하면 쓸 수 있어요") : t("무엇이든 물어보세요")}
              disabled={loginNeeded}
              className="max-h-[180px] w-full resize-none bg-transparent px-2 py-2.5 text-[15px] leading-relaxed placeholder:text-faint disabled:cursor-not-allowed"
            />
          </label>
          <button
            onClick={submit}
            disabled={!text.trim() || busy || loginNeeded}
            aria-label={t("보내기")}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
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
    </div>
  );

  if (notFound) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="text-sm text-muted">{t("대화를 찾을 수 없어요.")}</p>
        <Link href="/tutor" className="mt-4 inline-block text-sm font-semibold underline underline-offset-4">
          {t("새 대화 시작하기")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-1px)] w-full max-w-[1200px] flex-col px-4 md:px-8">
      <header className="flex h-14 shrink-0 items-center justify-between">
        <h1 className="min-w-0 truncate text-[15px] font-bold">{title || t("AI 튜터")}</h1>
        <Link
          href="/tutor"
          aria-label={t("새 대화")}
          title={t("새 대화")}
          className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-raised hover:text-foreground"
        >
          <Plus size={20} strokeWidth={1.8} />
        </Link>
      </header>

      <div className={canStudy ? "grid flex-1 gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start" : "flex flex-1 flex-col"}>
        <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
          {initialId && (authLoading || (!!user && loading)) ? (
            <p role="status" className="flex flex-1 items-center justify-center gap-2 text-[13px] text-muted">
              <LoaderCircle size={14} strokeWidth={1.8} className="animate-spin" />
              {t("불러오는 중...")}
            </p>
          ) : !hasMessages ? (
            <div className="flex flex-1 flex-col items-center justify-center pb-24 text-center">
              <h2 className="mb-8 text-[28px] font-semibold tracking-tight">{t("무엇을 도와드릴까요?")}</h2>
              <div className="w-full">{composer}</div>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {CHIPS.map((c) => (
                  <button
                    key={c}
                    disabled={loginNeeded}
                    onClick={() => {
                      setText(t(c));
                      requestAnimationFrame(() => {
                        autosize();
                        areaRef.current?.focus();
                      });
                    }}
                    className="rounded-full border border-border-strong px-4 py-2 text-[13px] text-muted transition-colors hover:bg-raised hover:text-foreground disabled:opacity-40"
                  >
                    {t(c)}
                  </button>
                ))}
              </div>
              {error && (
                <p role="alert" className="mt-4 text-[13px] text-danger">
                  {error}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-6 pb-6 pt-2" aria-live="polite">
                {messages.map((m) => (
                  <Message key={m.id} m={m} />
                ))}
                {pendingQuestion && (
                  <div className="rounded-2xl bg-surface px-4 py-3.5">
                    <p className="text-[14px] font-semibold">{pendingQuestion.text}</p>
                    {pendingQuestion.options.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {pendingQuestion.options.map((o) => (
                          <button
                            key={o}
                            onClick={() => void send(o, null)}
                            className="rounded-full bg-raised px-3.5 py-1.5 text-[13px] font-semibold transition-colors hover:bg-border-strong"
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                    )}
                    {pendingQuestion.allowOther && <p className="mt-2.5 text-xs text-faint">{t("또는 아래에 직접 입력해도 돼요")}</p>}
                  </div>
                )}
                {busy && (
                  <p role="status" className="flex items-center gap-2 text-[13px] text-muted">
                    <LoaderCircle size={14} strokeWidth={1.8} className="animate-spin" />
                    {t("답을 쓰는 중이에요")}
                  </p>
                )}
                {error && (
                  <p role="alert" className="rounded-xl border border-danger/50 px-3.5 py-2.5 text-[13px] text-danger">
                    {error}
                  </p>
                )}
                <div ref={bottomRef} />
              </div>
              <div className="sticky bottom-0 bg-background pb-5 pt-2">{composer}</div>
            </>
          )}
        </div>

        {canStudy && conversationId && <StudyRail studyRef={{ kind: "tutor", id: conversationId }} title={title || t("AI 튜터")} hideChat />}
      </div>
    </div>
  );
}
