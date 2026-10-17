"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useT } from "@/lib/i18n";

/** 작업 화면 맨 위의 경로 표시: "내 창작물 / 제목". 누르면 홈으로 돌아간다. */
export default function Breadcrumb({ title, onHome }: { title: string; onHome?: () => void }) {
  const t = useT();
  const root = "shrink-0 rounded-full px-2.5 py-1 text-muted transition-colors hover:bg-surface hover:text-foreground";
  return (
    <nav aria-label={t("경로")} className="mb-5 flex min-w-0 items-center gap-1 text-[13px]">
      {onHome ? (
        <button onClick={onHome} className={root}>
          {t("내 창작물")}
        </button>
      ) : (
        <Link href="/" className={root}>
          {t("내 창작물")}
        </Link>
      )}
      <ChevronRight size={14} strokeWidth={1.8} className="shrink-0 text-faint" aria-hidden />
      <span className="min-w-0 truncate px-1 font-semibold" title={title}>
        {title}
      </span>
    </nav>
  );
}
