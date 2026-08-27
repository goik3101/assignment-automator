"use client";

import { useState, type ReactNode } from "react";
import type { MemoNote } from "@/types/task";

// F8/9-2: 히스토리 상세 화면의 "결과 보기 / 암기노트" 탭. 로그인 사용자 무료.
export default function MemoNoteTabs({ historyId, children }: { historyId: string; children: ReactNode }) {
  const [tab, setTab] = useState<"result" | "memo">("result");
  const [memo, setMemo] = useState<MemoNote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openMemoTab() {
    setTab("memo");
    if (memo || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/histories/${historyId}/memo-note`);
      if (!res.ok) throw new Error((await res.json()).error ?? "암기노트를 불러오지 못했습니다.");
      setMemo(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "암기노트를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-border">
        <button
          onClick={() => setTab("result")}
          className={
            "px-3 py-2 text-sm font-medium border-b-2 -mb-px " +
            (tab === "result" ? "border-accent text-accent" : "border-transparent text-muted")
          }
        >
          결과 보기
        </button>
        <button
          onClick={openMemoTab}
          className={
            "px-3 py-2 text-sm font-medium border-b-2 -mb-px " +
            (tab === "memo" ? "border-accent text-accent" : "border-transparent text-muted")
          }
        >
          암기노트
        </button>
      </div>

      {tab === "result" && children}

      {tab === "memo" && (
        <div className="rounded-lg border border-border bg-surface p-6">
          {loading && <p className="text-sm text-muted">암기노트를 만드는 중...</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {memo && (
            <>
              <h3 className="mb-2 text-xs font-medium text-muted">키워드</h3>
              <div className="mb-6 flex flex-wrap gap-2">
                {memo.keywords.map((k) => (
                  <span key={k} className="rounded-full bg-accent/10 px-3 py-1 text-xs text-accent">
                    {k}
                  </span>
                ))}
              </div>
              <h3 className="mb-2 text-xs font-medium text-muted">핵심 요약</h3>
              <ul className="list-disc space-y-1.5 pl-5 text-sm">
                {memo.summary_points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
