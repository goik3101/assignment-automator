"use client";

import { useState } from "react";
import SettingsPanel from "@/components/settings/SettingsPanel";
import type { SettingsTab } from "@/lib/settings/open";

// 직접 주소로 들어온 경우를 위한 전체 화면 설정. 평소에는 사이드바/헤더의 설정 버튼이 모달로 연다.
export default function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("general");
  return (
    <div className="w-full px-6 py-6 md:px-8">
      <h1 className="mb-6 text-[22px] font-bold tracking-tight">설정</h1>
      <div className="max-w-3xl overflow-hidden rounded-2xl border border-border bg-surface">
        <SettingsPanel tab={tab} onTab={setTab} />
      </div>
    </div>
  );
}
