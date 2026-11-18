"use client";

import { useState } from "react";
import type { Announcement } from "@/lib/admin/announcements";
import Button from "@/components/ui/Button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function AnnouncementsManager({ initialItems }: { initialItems: Announcement[] }) {
  const [items, setItems] = useState(initialItems);
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [target, setTarget] = useState<Announcement | null>(null);

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
      <section className="space-y-3 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">새 공지 작성</h2>
        <p className="text-xs leading-relaxed text-muted">
          작성하면 즉시 메인 화면 맨 위에 한 줄 띠로 노출돼요(가장 최근 글 하나만 보여줌). 첫 줄은 제목으로 보이고, 둘째 줄부터는 “자세히”를
          눌러야 펼쳐져요. 예전 글을 다시 띄우려면 새로 작성하거나 삭제 후 다시 써야 해요.
        </p>
        {error && <p className="text-xs text-danger">{error}</p>}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder={"예: 9/20(토) 서버 점검 안내\n새벽 2시~4시에 서버 점검이 있어요."}
          className="w-full resize-none rounded-xl border border-border-strong bg-background px-4 py-3 text-sm placeholder:text-faint focus:border-foreground"
        />
        <Button variant="primary" size="sm" onClick={handlePost} disabled={!message.trim() || posting}>
          {posting ? "게시 중..." : "게시"}
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted">지난 공지 ({items.length}건)</h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted">아직 작성한 공지가 없어요.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className={[
                  "flex items-start justify-between gap-3 rounded-xl border p-4",
                  item.id === current?.id ? "border-foreground/30 bg-surface" : "border-border bg-surface",
                ].join(" ")}
              >
                <div className="min-w-0">
                  {item.id === current?.id && (
                    <span className="mb-1.5 inline-block rounded-full bg-raised px-2 py-0.5 text-[11px] font-medium">현재 노출 중</span>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm">{item.message}</p>
                  <p className="mt-1.5 text-xs text-muted">{new Date(item.created_at).toLocaleString("ko-KR")}</p>
                </div>
                <Button size="sm" variant="danger" onClick={() => setTarget(item)} disabled={deletingId === item.id}>
                  {deletingId === item.id ? "삭제 중..." : "삭제"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AlertDialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>공지 삭제</AlertDialogTitle>
            <AlertDialogDescription>이 공지를 삭제할까요? 삭제하면 사용자 화면에서 바로 사라져요.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={() => target && void handleDelete(target.id)}>
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
