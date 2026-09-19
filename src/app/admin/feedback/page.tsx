import Link from "next/link";
import { requireAdminOrRedirect } from "@/lib/admin/session";
import { listFeedback } from "@/lib/admin/feedback";

export default async function AdminFeedbackPage() {
  await requireAdminOrRedirect();
  const items = await listFeedback();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">문의·피드백</h1>
        <Link href="/admin" className="text-xs text-muted underline underline-offset-2 hover:text-foreground">
          대시보드로
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted">아직 접수된 피드백이 없어요.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-muted">
                <span>{new Date(item.created_at).toLocaleString("ko-KR")}</span>
                <span>{item.from_logged_in_user ? "로그인 사용자" : "비로그인"}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{item.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
