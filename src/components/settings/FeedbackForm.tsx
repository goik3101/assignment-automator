"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { Check, ExternalLink, Loader2, Plus, Upload, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { CONTACT_EMAIL, DISCORD_URL } from "@/lib/seo/site";
import { MAX_ATTACHMENTS } from "@/lib/feedback/attachments";
import { compressImage } from "@/lib/feedback/compress-image";

interface Picked {
  id: string;
  file: File;
  preview: string;
}

const MAX_CHARS = 2000;

// 피드백/문의 탭 본문. 글(필수) + 화면 캡처 같은 이미지(선택, 최대 3장)를 /api/feedback으로 보낸다.
// 이미지는 올리기 전에 브라우저에서 줄이고, 붙여넣기(Ctrl+V)·끌어다 놓기·선택창 모두 받는다.
export default function FeedbackForm() {
  const t = useT();
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

  const slotsLeft = MAX_ATTACHMENTS - picked.length - busy;

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
      for (const p of picked) form.append("files", p.file);
      const res = await fetch("/api/feedback", { method: "POST", body: form });
      // 서버가 받지 못했는데 "전달했어요"를 띄우고 글을 지우면 사용자가 쓴 내용이 사라진다 — 실패하면 글을 남기고 알린다.
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? t("전달하지 못했어요. 잠시 후 다시 시도해주세요."));
      picked.forEach((p) => URL.revokeObjectURL(p.preview));
      setMessage("");
      setPicked([]);
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("전달하지 못했어요. 잠시 후 다시 시도해주세요."));
    } finally {
      setSending(false);
    }
  }

  return (
    <section>
      <h3 className="text-[18px] font-bold tracking-tight">{t("피드백 남기기")}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">{t("불편한 점이나 바라는 기능을 알려 주세요. 보내 주신 내용은 서비스 개선에만 써요.")}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        {t("Discord에 들어오시면 더 정확한 피드백을 드릴 수 있어요.")}{" "}
        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-foreground underline underline-offset-2">
          {t("Discord 입장")}
          <ExternalLink size={12} strokeWidth={2} aria-hidden />
        </a>
      </p>

      <label htmlFor="feedback-message" className="mt-6 block text-sm font-semibold">
        {t("문의사항 (필수)")} <span className="text-danger" aria-hidden>*</span>
      </label>
      <textarea
        id="feedback-message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onPaste={onPaste}
        maxLength={MAX_CHARS}
        rows={6}
        placeholder={t("문의사항, 제안사항 또는 문제점을 자세히 설명해주세요...")}
        className="mt-2 w-full resize-none rounded-xl border border-border-strong bg-surface px-3.5 py-3 text-sm leading-relaxed outline-none placeholder:text-faint focus:border-foreground"
      />
      <p className="mt-1 text-right text-xs tabular-nums text-faint">{message.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}</p>

      <p className="mt-4 text-sm font-semibold">{t("첨부 이미지 (화면 캡처 등)")}</p>
      {(picked.length > 0 || busy > 0) && (
        <ul className="mt-2 flex flex-wrap gap-3">
          {picked.map((p) => (
            <li key={p.id} className="relative">
              {/* 브라우저 안에서 만든 미리보기(blob:)라 next/image를 거치지 않는다 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt={p.file.name} className="h-20 w-20 rounded-lg border border-border-strong object-cover" />
              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label={t("이미지 삭제")}
                className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full border border-border-strong bg-background text-muted transition-colors hover:text-foreground"
              >
                <X size={13} strokeWidth={2} />
              </button>
            </li>
          ))}
          {Array.from({ length: busy }).map((_, i) => (
            <li key={`busy-${i}`} className="grid h-20 w-20 place-items-center rounded-lg border border-border-strong bg-surface text-muted">
              <Loader2 size={18} className="animate-spin" aria-label={t("이미지 줄이는 중")} />
            </li>
          ))}
          {slotsLeft > 0 && (
            <li>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                aria-label={t("이미지 추가")}
                className="grid h-20 w-20 place-items-center rounded-lg border border-dashed border-border-strong text-muted transition-colors hover:border-foreground hover:text-foreground"
              >
                <Plus size={20} strokeWidth={1.8} />
              </button>
            </li>
          )}
        </ul>
      )}
      {picked.length === 0 && busy === 0 && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={[
            "mt-2 flex h-20 w-full items-center justify-center gap-2 rounded-xl border border-dashed text-[13px] text-muted transition-colors hover:border-foreground hover:text-foreground",
            dragging ? "border-foreground bg-surface text-foreground" : "border-border-strong",
          ].join(" ")}
        >
          <Upload size={16} strokeWidth={1.8} aria-hidden />
          {t("클릭하여 업로드하거나 이미지를 끌어다 놓으세요")}
        </button>
      )}
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
      <p className="mt-2 text-xs text-faint">{t("이미지 최대 {n}장. 큰 이미지는 자동으로 줄여서 올려요.", { n: MAX_ATTACHMENTS })}</p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-border pt-4">
        <p className="text-xs leading-relaxed text-muted">
          {t("이메일로 문의하셔도 돼요.")}{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2 hover:text-foreground">{CONTACT_EMAIL}</a>
        </p>
        <div className="flex items-center gap-3">
          {sent && (
            <p role="status" className="inline-flex items-center gap-1 text-xs text-muted">
              <Check size={13} strokeWidth={2} aria-hidden />
              {t("전달했어요. 감사합니다!")}
            </p>
          )}
          {error && (
            <p role="alert" className="max-w-[260px] text-xs text-danger">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!message.trim() || sending || busy > 0}
            className="inline-flex h-10 items-center rounded-full bg-foreground px-5 text-[13px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {t("피드백 제출")}
          </button>
        </div>
      </div>
    </section>
  );
}
