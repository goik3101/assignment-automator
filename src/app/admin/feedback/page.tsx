import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdminOrRedirect } from "@/lib/admin/session";
import { listFeedback } from "@/lib/admin/feedback";

export default async function AdminFeedbackPage() {
  await requireAdminOrRedirect();
  const items = await listFeedback();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">문의·피드백</h1>
        <Link href="/admin" className="inline-flex items-center gap-0.5 text-[13px] font-medium text-muted transition-colors hover:text-foreground">
          <ChevronLeft size={15} strokeWidth={1.8} aria-hidden />
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
              {item.attachments.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {item.attachments.map((a) => (
                    <li key={a.url}>
                      <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.name} className="block overflow-hidden rounded-lg border border-border-strong">
                        {/* 비공개 버킷의 임시 주소라 next/image 최적화를 거치지 않는다 */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.url} alt={a.name} loading="lazy" className="h-28 w-auto max-w-[220px] object-cover" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
