"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";

export default function DeleteHistoryButton({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(t("정말 삭제하시겠습니까? 삭제하면 되돌릴 수 없어요."))) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/histories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? t("삭제에 실패했습니다."));
      router.refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : t("삭제 중 오류가 발생했습니다."));
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      aria-label={t("히스토리 삭제")}
      title={t("삭제")}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-raised hover:text-danger disabled:opacity-40"
    >
      <Trash2 size={16} strokeWidth={1.7} />
    </button>
  );
}
