"use client";

import { useState } from "react";
import SettingsPanel from "@/components/settings/SettingsPanel";
import type { SettingsTab } from "@/lib/settings/open";
import { useT } from "@/lib/i18n";

// 직접 주소로 들어온 경우를 위한 전체 화면 설정. 평소에는 사이드바/헤더의 설정 버튼이 모달로 연다.
export default function SettingsPage() {
  const t = useT();
  const [tab, setTab] = useState<SettingsTab>("general");
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 md:px-10">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">{t("설정")}</h1>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <SettingsPanel tab={tab} onTab={setTab} />
      </div>
    </div>
  );
}
