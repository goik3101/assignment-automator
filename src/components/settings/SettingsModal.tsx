"use client";

import { useEffect, useState } from "react";
import { onOpenSettings, type SettingsTab } from "@/lib/settings/open";
import SettingsPanel from "./SettingsPanel";
import { useT } from "@/lib/i18n";

// 설정 화면: 가운데 모달 + 왼쪽 메뉴(닫기 버튼은 메뉴 맨 위). 레이아웃에 한 번만 붙어 있고 openSettings()로 연다.
export default function SettingsModal() {
  const t = useT();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("설정")}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex h-[min(680px,90vh)] w-full max-w-[880px] animate-[popIn_0.22s_ease-out] flex-col overflow-hidden rounded-3xl border border-border-strong bg-background shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
      >
        <div className="min-h-0 flex-1">
          <SettingsPanel tab={tab} onTab={setTab} onClose={() => setOpen(false)} />
        </div>
      </div>
    </div>
  );
}
