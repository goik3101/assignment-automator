import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdminOrRedirect } from "@/lib/admin/session";
import { listFeedback } from "@/lib/admin/feedback";
import { isShareMessage } from "@/lib/feedback/share";
import FeedbackReply from "@/components/admin/FeedbackReply";

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
                <span>{item.from_logged_in_user ? (item.email ?? "이메일로 보냄") : "익명"}</span>
              </div>
              {isShareMessage(item.message) ? (
                // 결과물 공유는 글이 길어 앞 5줄만 보이고 나머지는 펼쳐 본다.
                <details>
                  <summary className="cursor-pointer whitespace-pre-wrap text-sm">{item.message.split("\n").slice(0, 5).join("\n")}</summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{item.message}</p>
                </details>
              ) : (
                <p className="whitespace-pre-wrap text-sm">{item.message}</p>
              )}
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
              {/* 답변은 이메일(계정)로 보낸 피드백에만 달 수 있다 — 익명에는 보여 줄 대상이 없다. */}
              {item.from_logged_in_user ? (
                <FeedbackReply id={item.id} initial={item.reply} />
              ) : (
                !isShareMessage(item.message) && <p className="mt-3 border-t border-border pt-3 text-xs text-faint">익명으로 보낸 글이라 답변을 달 수 없어요. (이메일로 보낸 글에만 답변 칸이 나와요)</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
