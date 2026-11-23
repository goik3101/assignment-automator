"use client";

import { useEffect, useState } from "react";
import { onOpenSettings, type SettingsTab } from "@/lib/settings/open";
import SettingsPanel from "./SettingsPanel";
import { useT } from "@/lib/i18n";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// 설정 화면: 가운데 창 + 왼쪽 메뉴(닫기 버튼은 메뉴 맨 위). 레이아웃에 한 번만 붙어 있고 openSettings()로 연다.
// 초점 가두기·Esc·바깥 클릭 닫힘은 Dialog가 처리한다.
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="h-[min(680px,90dvh)] max-w-[880px]">
        <DialogTitle className="sr-only">{t("설정")}</DialogTitle>
        <SettingsPanel tab={tab} onTab={setTab} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
