"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";
import { DISCORD_URL } from "@/lib/seo/site";
import { MAX_ATTACHMENTS } from "@/lib/feedback/attachments";
import { compressImage } from "@/lib/feedback/compress-image";
import { SHARE_MAX_DISMISS, shouldAskShare } from "@/lib/feedback/share";

// "STUDED AI 개선 돕기": 결과를 어느 정도 읽은 뒤(화면 2/3 지점) 가운데에 한 번 뜨는 요청 창.
// 학생이 "보내기"를 직접 눌렀을 때만 안내문 사진·결과물 글·추가 요청을 /api/feedback(kind=share)으로 보낸다.
// 계정과 잇지 않는다(서버가 user_id를 비운다). 생성 직후 화면에만 안내문 사진이 있어 저장된 결과물을 다시 열 때는 쓰지 않는다.
export interface NoticeImage {
  base64: string;
  mimeType: string;
}

const OFF_KEY = "studed:help:off";
const DISMISS_KEY = "studed:help:dismissed";

function readState(seenKey: string) {
  try {
    return {
      off: window.localStorage.getItem(OFF_KEY) === "1",
      dismissed: Number(window.localStorage.getItem(DISMISS_KEY) ?? "0") || 0,
      seenThisResult: window.localStorage.getItem(seenKey) === "1",
    };
  } catch {
    // 저장소가 막혀 있으면 묻지 않는다 — 같은 창이 계속 뜨는 것보다 낫다.
    return { off: true, dismissed: SHARE_MAX_DISMISS, seenThisResult: true };
  }
}
function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 무시 */
  }
}

function toFile(img: NoticeImage, i: number): File {
  const bin = atob(img.base64);
  const bytes = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
  const ext = img.mimeType.includes("png") ? "png" : "jpg";
  return new File([bytes], `notice-${i + 1}.${ext}`, { type: img.mimeType });
}

export default function HelpImproveDialog({
  resultKey,
  ready,
  images,
  buildMessage,
}: {
  resultKey: string;
  /** 결과가 다 만들어졌고 평가 바가 닫혔을 때만 true — 두 창이 겹치지 않게 한다. */
  ready: boolean;
  images: NoticeImage[];
  buildMessage: () => string;
}) {
  const t = useT();
  const seenKey = `studed:help:seen:${resultKey}`;
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const shown = useMemo(() => images.slice(0, MAX_ATTACHMENTS), [images]);

  // 평가 바가 닫힌 뒤, 화면 2/3 지점을 지났을 때 한 번. 닫힌 직후 바로 겹쳐 뜨지 않게 잠깐 기다린다.
  useEffect(() => {
    if (!ready || shown.length === 0) return;
    if (!shouldAskShare(readState(seenKey))) return;
    const check = () => {
      const doc = document.documentElement;
      if ((window.scrollY + window.innerHeight) / Math.max(1, doc.scrollHeight) >= 2 / 3) {
        window.removeEventListener("scroll", check);
        write(seenKey, "1");
        setOpen(true);
      }
    };
    const timer = window.setTimeout(() => {
      check();
      window.addEventListener("scroll", check, { passive: true });
    }, 1500);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", check);
    };
  }, [ready, shown.length, seenKey]);

  function dismiss() {
    if (phase === "sent") {
      setOpen(false);
      return;
    }
    const n = (readState(seenKey).dismissed ?? 0) + 1;
    write(DISMISS_KEY, String(n));
    setOpen(false);
  }

  async function send() {
    if (phase !== "idle") return;
    setPhase("sending");
    setError(null);
    try {
      const form = new FormData();
      form.set("kind", "share");
      form.set("message", buildMessage());
      for (const [i, img] of shown.entries()) {
        const small = await compressImage(toFile(img, i));
        if (small) form.append("files", small);
      }
      const res = await fetch("/api/feedback", { method: "POST", body: form });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? t("전달하지 못했어요. 잠시 후 다시 시도해주세요."));
      write(OFF_KEY, "1");
      setPhase("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("전달하지 못했어요. 잠시 후 다시 시도해주세요."));
      setPhase("idle");
    }
  }

  if (!open) return null;

  return (
    <Modal title={t("STUDED AI 개선을 도와주세요")} onClose={dismiss} width={460} compact busy={phase === "sending"}>
      {phase === "sent" ? (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Check size={16} strokeWidth={2} aria-hidden />
            {t("보내 주셔서 고마워요. 같은 문제가 다시 생기지 않게 고칠게요.")}
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={dismiss}>
              {t("닫기")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-[13px] leading-relaxed">
          <p className="text-muted">
            {t("지금은 베타 버전이라 안내문을 잘못 읽거나 글이 어색할 수 있어요. 방금 쓴 안내문 사진과 결과물을 보내 주시면, 같은 문제가 다른 친구들에게 생기지 않게 고칠게요.")}
          </p>

          <div className="rounded-xl border border-border bg-background p-3.5">
            <p className="text-xs font-semibold text-faint">{t("이렇게 보내져요")}</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-muted">
              <li>{t("안내문 사진 {n}장", { n: shown.length })}</li>
              <li>{t("만들어진 결과물 글과 출처")}</li>
              <li>{t("내가 적은 추가 요청")}</li>
            </ul>
            <ul className="mt-2.5 flex gap-2">
              {shown.map((img, i) => (
                <li key={i}>
                  {/* 브라우저 메모리의 data URL이라 next/image를 거치지 않는다 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`data:${img.mimeType};base64,${img.base64}`} alt={t("안내문 사진 {n}", { n: i + 1 })} className="h-16 w-12 rounded-md border border-border-strong object-cover" />
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-xs text-faint">
              {t("이메일·계정 정보는 함께 보내지 않아요. 안내문에 이름이나 학교가 보이면 보내지 않으셔도 돼요.")}
            </p>
          </div>

          <p className="text-xs text-faint">
            {t("운영자만 볼 수 있고 서비스 개선에만 쓰며 1년간 보관해요. 보내지 않아도 서비스는 똑같이 쓸 수 있어요.")}{" "}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
              {t("개인정보처리방침")}
            </a>
          </p>

          <p className="text-xs text-muted">
            {t("Discord 커뮤니티에 참가하면 더 좋은 의견을 나눌 수 있어요.")}{" "}
            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-foreground underline underline-offset-2">
              {t("Discord 입장")}
              <ExternalLink size={12} strokeWidth={2} aria-hidden />
            </a>
          </p>

          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={dismiss} disabled={phase === "sending"}>
              {t("다음에")}
            </Button>
            <Button variant="primary" onClick={send} disabled={phase === "sending"}>
              {phase === "sending" && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {t("보내기")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
