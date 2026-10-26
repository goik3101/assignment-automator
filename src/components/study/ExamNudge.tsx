"use client";

import { GraduationCap } from "lucide-react";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n";

/** 요약·플래시카드·퀴즈 창 맨 아래: 다 외웠으면 가상 시험으로 이어 가라는 안내. 시험 창을 열 수 없는 곳에서는 그리지 않는다. */
export default function ExamNudge({ onOpenExam }: { onOpenExam?: () => void }) {
  const t = useT();
  if (!onOpenExam) return null;
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3.5">
      <p className="text-sm text-muted">{t("다 외우셨다면 가상 시험도 볼 수 있어요")}</p>
      <Button size="sm" variant="primary" onClick={onOpenExam}>
        <GraduationCap size={14} strokeWidth={1.8} />
        {t("가상 시험 보기")}
      </Button>
    </div>
  );
}
