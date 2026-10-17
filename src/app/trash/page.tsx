"use client";

import { BookOpen, Sparkles, Trash2, Undo2 } from "lucide-react";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/use-auth";
import { useLang } from "@/lib/i18n";

interface TrashRow {
  key: string;
  kind: "auto" | "learning";
  id: string;
  title: string;
  subject: string;
  at: string;
}

// 휴지통: 삭제한 결과물(자동 작성)과 학습 과제를 복원하거나 영구 삭제한다.
// 두 종류를 각각 독립적으로 불러온다 — 한쪽 테이블이 아직 없어도 다른 쪽은 보인다.
export default function TrashPage() {
  const { t, lang } = useLang();
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<TrashRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const get = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [h, l] = await Promise.all([get("/api/histories/trash"), get("/api/learning/sessions?trashed=1")]);
    const merged: TrashRow[] = [
      ...((h?.histories ?? []) as { id: string; title: string | null; subject: string; trashed_at: string }[]).map((x) => ({
        key: `h-${x.id}`,
        kind: "auto" as const,
        id: x.id,
        title: x.title || x.subject,
        subject: x.subject,
        at: x.trashed_at,
      })),
      ...((l?.sessions ?? []) as { id: string; title: string; subject: string; deleted_at: string }[]).map((x) => ({
        key: `l-${x.id}`,
        kind: "learning" as const,
        id: x.id,
        title: x.title,
        subject: x.subject,
        at: x.deleted_at,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    return merged;
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    load().then((m) => {
      if (!cancelled) setRows(m);
    });
    return () => {
      cancelled = true;
    };
  }, [user, load]);

  async function act(r: TrashRow, action: "restore" | "delete") {
    if (action === "delete" && !window.confirm(t("영구 삭제하면 되돌릴 수 없어요. 삭제할까요?"))) return;
    const base = r.kind === "auto" ? `/api/histories/${r.id}` : `/api/learning/sessions/${r.id}`;
    try {
      const res =
        action === "restore"
          ? await fetch(`${base}/restore`, { method: "POST" })
          : await fetch(`${base}?permanent=1`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("처리하지 못했어요. 잠시 후 다시 시도해주세요."));
      setRows((prev) => prev?.filter((x) => x.key !== r.key) ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("처리하지 못했어요."));
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 md:px-10">
      <h1 className="text-2xl font-bold tracking-tight">{t("휴지통")}</h1>
      <p className="mb-8 mt-1.5 text-sm text-muted">{t("삭제한 작업은 여기서 되돌리거나 완전히 지울 수 있어요.")}</p>
      {error && (
        <p role="alert" className="mb-5 rounded-xl border border-danger/50 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      {!loading && !user && <p className="text-sm text-muted">{t("로그인하면 삭제한 작업을 여기서 복원할 수 있어요.")}</p>}
      {user && rows === null && <p className="text-sm text-muted">{t("불러오는 중…")}</p>}
      {user && rows && rows.length === 0 && <p className="text-sm text-muted">{t("휴지통이 비어 있어요.")}</p>}
      {rows && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                {r.kind === "learning" ? <BookOpen size={16} strokeWidth={1.7} className="shrink-0 text-faint" aria-label={t("학습 모드")} /> : <Sparkles size={16} strokeWidth={1.7} className="shrink-0 text-faint" aria-label={t("AI 모드")} />}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{r.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {t("{subject} · {date} 삭제", { subject: r.subject, date: new Date(r.at).toLocaleDateString(lang === "en" ? "en-US" : "ko-KR") })}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => act(r, "restore")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong px-3 text-[13px] font-semibold transition-colors hover:bg-raised">
                  <Undo2 size={14} strokeWidth={1.8} />
                  {t("복원")}
                </button>
                <button onClick={() => act(r, "delete")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-danger/50 px-3 text-[13px] font-semibold text-danger transition-colors hover:bg-danger/10">
                  <Trash2 size={14} strokeWidth={1.8} />
                  {t("영구 삭제")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
