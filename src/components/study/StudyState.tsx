"use client";

import type { ReactNode } from "react";
import { CircleAlert, LoaderCircle, RefreshCw } from "lucide-react";
import Button from "@/components/ui/Button";

/** 학습 도구 공통: 만드는 중 / 실패(다시 시도) / 완성 화면을 한 틀로 보여준다. */
export default function StudyState({
  loading,
  error,
  onRetry,
  loadingText,
  children,
}: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  loadingText: string;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-16 text-center">
        <LoaderCircle size={26} strokeWidth={1.6} className="animate-spin text-muted" />
        <p className="text-sm text-muted">{loadingText}</p>
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="flex flex-col items-center gap-4 py-12 text-center">
        <CircleAlert size={26} strokeWidth={1.6} className="text-danger" />
        <p className="max-w-sm text-sm leading-relaxed text-muted">{error}</p>
        <Button size="sm" onClick={onRetry}>
          <RefreshCw size={14} strokeWidth={1.8} />
          다시 시도
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}

export function CachedNote({ at, onRefresh, busy }: { at: number | null; onRefresh: () => void; busy?: boolean }) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4 text-xs text-faint">
      <span>{at ? `${new Date(at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}에 만든 내용이에요` : "방금 만들었어요"}</span>
      <button
        onClick={onRefresh}
        disabled={busy}
        className="inline-flex items-center gap-1.5 font-medium text-muted transition-colors hover:text-foreground disabled:opacity-40"
      >
        <RefreshCw size={12} strokeWidth={1.8} />
        다시 만들기
      </button>
    </div>
  );
}
