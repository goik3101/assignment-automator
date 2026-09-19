"use client";

import { useEffect, useState } from "react";
import { onOpenSettings, type SettingsTab } from "@/lib/settings/open";
import SettingsPanel from "./SettingsPanel";

// Figma 설정 화면: 가운데 모달 + 왼쪽 탭. 레이아웃에 한 번만 붙어 있고 openSettings()로 연다.
export default function SettingsModal() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SettingsTab>("general");

  useEffect(
    () =>
      onOpenSettings((t) => {
        setTab(t);
        setOpen(true);
      }),
    []
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="설정"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-[min(560px,90vh)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface"
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-bold">설정</h2>
          <button onClick={() => setOpen(false)} aria-label="닫기" className="text-lg font-bold leading-none hover:opacity-70">
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1">
          <SettingsPanel tab={tab} onTab={setTab} />
        </div>
      </div>
    </div>
  );
}
