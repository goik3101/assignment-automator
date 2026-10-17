"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";

/** 공통 모달: 바깥 클릭·Esc로 닫히고, 열릴 때 안쪽 첫 입력으로 포커스가 가며, 닫히면 원래 자리로 돌아간다. */
export default function Modal({
  title,
  onClose,
  children,
  width = 560,
  busy = false,
  hideTitle = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  /** 작업 중에는 닫기를 막는다. */
  busy?: boolean;
  hideTitle?: boolean;
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>("input, textarea, select, button:not([data-modal-close])");
    first?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth: width }}
        className="relative max-h-[92vh] w-full animate-[popIn_0.22s_ease-out] overflow-y-auto rounded-3xl bg-background p-6 shadow-[0_24px_80px_rgba(0,0,0,0.25)] sm:p-9"
      >
        <button
          data-modal-close
          onClick={onClose}
          disabled={busy}
          aria-label={t("닫기")}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-foreground disabled:opacity-40"
        >
          <X size={16} strokeWidth={1.8} />
        </button>
        {!hideTitle && <h2 className="mb-6 pr-8 text-lg font-bold tracking-tight">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
