"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import Button from "@/components/ui/Button";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function DeleteHistoryButton({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/histories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? t("삭제에 실패했습니다."));
      setOpen(false);
      router.refresh();
    } catch (err) {
      // 브라우저 기본 alert 대신 확인창 안에 오류를 보여 주고 창을 열어 둔다.
      setError(err instanceof Error ? err.message : t("삭제 중 오류가 발생했습니다."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        aria-label={t("히스토리 삭제")}
        title={t("삭제")}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-raised hover:text-danger"
      >
        <Trash2 size={16} strokeWidth={1.7} />
      </button>
      <AlertDialog open={open} onOpenChange={(o) => !loading && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("삭제")}</AlertDialogTitle>
            <AlertDialogDescription>{t("정말 삭제하시겠습니까? 삭제하면 되돌릴 수 없어요.")}</AlertDialogDescription>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>{t("취소")}</AlertDialogCancel>
            <Button variant="danger" onClick={() => void handleDelete()} disabled={loading}>
              {t("삭제")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
