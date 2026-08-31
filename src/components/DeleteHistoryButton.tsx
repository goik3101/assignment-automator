"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteHistoryButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("정말 삭제하시겠습니까? 삭제하면 되돌릴 수 없어요.")) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/histories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "삭제에 실패했습니다.");
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다.");
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      aria-label="히스토리 삭제"
      title="삭제"
      className="shrink-0 rounded-md p-1.5 text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950"
    >
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path
          d="M5 6h10M8.5 6V4.5h3V6M6 6l.6 9.4a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9L14 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
