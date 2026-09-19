"use client";

import { openSettings, type SettingsTab } from "@/lib/settings/open";

// 서버 컴포넌트(Footer 등)에서도 설정 모달을 열 수 있게 하는 얇은 버튼.
export default function OpenSettingsButton({
  tab = "general",
  className,
  children,
}: {
  tab?: SettingsTab;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={() => openSettings(tab)} className={className}>
      {children}
    </button>
  );
}
