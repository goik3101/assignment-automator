"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { Check, ImagePlus, Loader2, Mail, MessageCircle, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { CONTACT_EMAIL, DISCORD_URL } from "@/lib/seo/site";
import { MAX_ATTACHMENTS } from "@/lib/feedback/attachments";
import { compressImage } from "@/lib/feedback/compress-image";
import { useAuth } from "@/lib/supabase/use-auth";
import type { FeedbackIdentity } from "@/lib/feedback/identity";
import type { MyFeedback } from "@/lib/feedback/reply";

interface Picked {
  id: string;
  file: File;
  preview: string;
}

const MAX_CHARS = 2000;

// 피드백/문의 탭 본문. 글(필수) + 화면 캡처 같은 이미지(선택, 최대 3장)를 /api/feedback으로 보낸다.
// 입력은 AI 채팅 입력창처럼 카드 하나(글·이미지·보내기)로 합치고, 보내는 방식은 스위치 한 줄, 내가 보낸 글과 답변은 위쪽 탭으로 나눈다.
// 이미지는 올리기 전에 브라우저에서 줄이고, 붙여넣기(Ctrl+V)·끌어다 놓기·선택창 모두 받는다.
export default function FeedbackForm() {
  const t = useT();
  const { user } = useAuth();
  // 익명이 기본. 이메일(내 계정)로 보내기를 직접 고른 경우에만 개발자가 이메일을 보고 답변을 남길 수 있다.
  const [identity, setIdentity] = useState<FeedbackIdentity>("anonymous");
  const [mine, setMine] = useState<MyFeedback[]>([]);
  const [view, setView] = useState<"write" | "mine">("write");
  const [message, setMessage] = useState("");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(0); // 줄이는 중인 이미지 수
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previews = useRef<string[]>([]);

  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  // 목록을 못 불러와도 글 보내기는 그대로 된다.
  const [mineTick, setMineTick] = useState(0);
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetch("/api/feedback/mine")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items?: MyFeedback[] } | null) => {
        if (alive && data) setMine(data.items ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [userId, mineTick]);

  // 로그아웃하면 내 글·방식·탭을 처음 상태로 돌린다(렌더 중에 한 번만 비교해서 바꾼다).
  const [lastUser, setLastUser] = useState(userId);
  if (lastUser !== userId) {
    setLastUser(userId);
    if (!userId) {
      setMine([]);
      setIdentity("anonymous");
      setView("write");
    }
  }

  const slotsLeft = MAX_ATTACHMENTS - picked.length - busy;
  const showMine = view === "mine" && !!user && mine.length > 0;

  async function addFiles(list: FileList | File[]) {
    const images = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      setError(t("이미지 파일만 올릴 수 있어요."));
      return;
    }
    const room = Math.max(0, slotsLeft);
    const take = images.slice(0, room);
    setError(images.length > room ? t("이미지는 최대 {n}장까지 올릴 수 있어요.", { n: MAX_ATTACHMENTS }) : null);
    if (take.length === 0) return;
    setBusy((n) => n + take.length);
    for (const file of take) {
      const small = await compressImage(file);
      setBusy((n) => n - 1);
      if (!small) {
        setError(t("이 이미지는 읽을 수 없어요. 다른 이미지를 올려 주세요."));
        continue;
      }
      const preview = URL.createObjectURL(small);
      previews.current.push(preview);
      setPicked((p) => [...p, { id: crypto.randomUUID(), file: small, preview }]);
    }
  }

  function remove(id: string) {
    setPicked((p) => {
      const hit = p.find((x) => x.id === id);
      if (hit) URL.revokeObjectURL(hit.preview);
      return p.filter((x) => x.id !== id);
    });
    setError(null);
  }

  function onPaste(e: ClipboardEvent) {
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    e.preventDefault();
    void addFiles(files);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void addFiles(e.dataTransfer.files);
  }

  async function submit() {
    if (!message.trim() || sending || busy > 0) return;
    setSending(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("message", message);
      form.set("identity", user ? identity : "anonymous");
      for (const p of picked) form.append("files", p.file);
      const res = await fetch("/api/feedback", { method: "POST", body: form });
      // 서버가 받지 못했는데 "전달했어요"를 띄우고 글을 지우면 사용자가 쓴 내용이 사라진다 — 실패하면 글을 남기고 알린다.
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? t("전달하지 못했어요. 잠시 후 다시 시도해주세요."));
      picked.forEach((p) => URL.revokeObjectURL(p.preview));
      setMessage("");
      setPicked([]);
      setSent(true);
      setTimeout(() => setSent(false), 3000);
      if (user && identity === "account") setMineTick((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("전달하지 못했어요. 잠시 후 다시 시도해주세요."));
    } finally {
      setSending(false);
    }
  }

  const tab = "inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium transition-colors";

  return (
    <section>
      <h3 className="text-[18px] font-bold tracking-tight">{t("피드백 남기기")}</h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{t("불편한 점이나 바라는 기능을 알려 주세요. 서비스 개선에만 써요.")}</p>

      {user && mine.length > 0 && (
        <div role="tablist" className="mt-4 inline-flex gap-0.5 rounded-full border border-border-strong p-0.5">
          <button role="tab" aria-selected={view === "write"} onClick={() => setView("write")} className={[tab, view === "write" ? "bg-foreground text-background" : "text-muted hover:text-foreground"].join(" ")}>
            {t("보내기")}
          </button>
          <button role="tab" aria-selected={view === "mine"} onClick={() => setView("mine")} className={[tab, view === "mine" ? "bg-foreground text-background" : "text-muted hover:text-foreground"].join(" ")}>
            {t("보낸 피드백")} <span className="ml-1 tabular-nums opacity-70">{mine.length}</span>
          </button>
        </div>
      )}

      {showMine ? (
        <ul className="mt-4 space-y-3">
          {mine.map((m) => (
            <li key={m.id} className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs text-muted">{new Date(m.created_at).toLocaleString()}</p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm">{m.message}</p>
              {m.reply ? (
                <div className="mt-3 rounded-xl border border-border-strong bg-background px-3.5 py-3">
                  <p className="text-xs font-semibold text-muted">{t("개발자 답변")}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{m.reply}</p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-faint">{t("답변을 기다리고 있어요.")}</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={["mt-4 rounded-2xl border bg-surface p-3 transition-colors focus-within:border-foreground/60", dragging ? "border-foreground" : "border-border-strong"].join(" ")}
          >
            <label htmlFor="feedback-message" className="sr-only">
              {t("문의사항 (필수)")}
            </label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onPaste={onPaste}
              maxLength={MAX_CHARS}
              rows={5}
              placeholder={t("무엇이든 적어 주세요. 화면 캡처는 붙여넣어도 돼요")}
              className="field-sizing-content block max-h-[50vh] min-h-32 w-full resize-none bg-transparent px-1 py-1 text-sm leading-relaxed outline-none placeholder:text-faint focus-visible:outline-none!"
            />
            {(picked.length > 0 || busy > 0) && (
              <ul className="mt-2 flex flex-wrap gap-2.5 px-1">
                {picked.map((p) => (
                  <li key={p.id} className="relative">
                    {/* 브라우저 안에서 만든 미리보기(blob:)라 next/image를 거치지 않는다 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.preview} alt={p.file.name} className="h-14 w-14 rounded-lg border border-border-strong object-cover" />
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      aria-label={t("이미지 삭제")}
                      className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-border-strong bg-background text-muted transition-colors hover:text-foreground"
                    >
                      <X size={11} strokeWidth={2} />
                    </button>
                  </li>
                ))}
                {Array.from({ length: busy }).map((_, i) => (
                  <li key={`busy-${i}`} className="grid h-14 w-14 place-items-center rounded-lg border border-border-strong bg-background text-muted">
                    <Loader2 size={16} className="animate-spin" aria-label={t("이미지 줄이는 중")} />
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={slotsLeft <= 0}
                aria-label={t("이미지 추가")}
                title={t("이미지 최대 {n}장. 큰 이미지는 자동으로 줄여서 올려요.", { n: MAX_ATTACHMENTS })}
                className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted transition-colors hover:bg-raised hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ImagePlus size={16} strokeWidth={1.7} aria-hidden />
                {t("이미지")}
                {picked.length > 0 && <span className="tabular-nums text-faint">{picked.length}/{MAX_ATTACHMENTS}</span>}
              </button>
              {message.length > 0 && (
                <span className="text-xs tabular-nums text-faint">
                  {message.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
                </span>
              )}
              <button
                type="button"
                onClick={submit}
                disabled={!message.trim() || sending || busy > 0}
                className="ml-auto inline-flex h-9 items-center rounded-full bg-foreground px-5 text-[13px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {t("보내기")}
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {(sent || error) && (
            <div className="mt-2.5 px-1" aria-live="polite">
              {sent && (
                <p role="status" className="inline-flex items-center gap-1 text-xs text-muted">
                  <Check size={13} strokeWidth={2} aria-hidden />
                  {t("전달했어요. 감사합니다!")}
                </p>
              )}
              {error && (
                <p role="alert" className="text-xs text-danger">
                  {error}
                </p>
              )}
            </div>
          )}

          {user ? (
            <div className="mt-3.5 flex items-start gap-3 px-1">
              <button
                type="button"
                role="switch"
                aria-checked={identity === "account"}
                aria-label={t("이메일로 보내고 답변 받기")}
                onClick={() => setIdentity((v) => (v === "account" ? "anonymous" : "account"))}
                className={["relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors", identity === "account" ? "border-foreground bg-foreground" : "border-border-strong bg-surface"].join(" ")}
              >
                <span className={["absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all", identity === "account" ? "left-[18px] bg-background" : "left-0.5 bg-muted"].join(" ")} />
              </button>
              <p className="text-[13px] leading-snug">
                <span className="font-medium">{t("이메일로 보내고 답변 받기")}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {identity === "account" ? t("내 계정 이메일이 개발자에게 보여요. 답변은 '보낸 피드백'에서 받아요.") : t("지금은 익명이에요. 이름도 이메일도 저장하지 않아요.")}
                </span>
              </p>
            </div>
          ) : (
            <p className="mt-3.5 px-1 text-xs leading-relaxed text-muted">{t("익명으로 전달돼요. 로그인하면 이메일로 보내 개발자 답변을 받을 수 있어요.")}</p>
          )}
        </>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-1 pt-4 text-[13px] text-muted">
        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
          <MessageCircle size={14} strokeWidth={1.7} aria-hidden />
          {t("Discord에서 더 자세히")}
        </a>
        <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
          <Mail size={14} strokeWidth={1.7} aria-hidden />
          {t("이메일 문의")}
        </a>
      </div>
    </section>
  );
}
