"use client";

import { useState } from "react";
import type { Announcement } from "@/lib/admin/announcements";

export default function AnnouncementsManager({ initialItems }: { initialItems: Announcement[] }) {
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handlePost() {
    if (!message.trim()) return;
    setPosting(true);
    setError(null);
    const res = await fetch("/api/admin/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    setPosting(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "작성에 실패했습니다.");
      return;
    }
    const { announcement } = await res.json();
    setItems((prev) => [announcement, ...prev]);
    setMessage("");
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/admin/announcements/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  const current = items[0];

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-md border border-border bg-surface p-4">
        <h2 className="text-sm font-medium">새 공지 작성</h2>
        <p className="text-xs text-muted">
          작성하면 즉시 메인 화면 구석에 노출돼요(가장 최근 글 하나만 보여줌). 예전 글을 다시
          띄우려면 새로 작성하거나 삭제 후 다시 써야 해요.
        </p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          placeholder="예: 9/20(토) 새벽 2시~4시 서버 점검이 있어요."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={handlePost}
          disabled={!message.trim() || posting}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-40"
        >
          {posting ? "게시 중..." : "게시"}
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted">지난 공지 ({items.length}건)</h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted">아직 작성한 공지가 없어요.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className={[
                  "flex items-start justify-between gap-3 rounded-md border p-3",
                  item.id === current?.id ? "border-accent/40 bg-accent/5" : "border-border bg-surface",
                ].join(" ")}
              >
                <div>
                  {item.id === current?.id && (
                    <span className="mb-1 inline-block rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      현재 노출 중
                    </span>
                  )}
                  <p className="text-sm">{item.message}</p>
                  <p className="mt-1 text-xs text-muted">{new Date(item.created_at).toLocaleString("ko-KR")}</p>
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingId === item.id}
                  className="shrink-0 rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 disabled:opacity-40 dark:border-red-800 dark:text-red-400"
                >
                  {deletingId === item.id ? "삭제 중..." : "삭제"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
