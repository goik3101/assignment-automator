import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdminOrRedirect } from "@/lib/admin/session";
import { listAnnouncements } from "@/lib/admin/announcements";
import AnnouncementsManager from "./AnnouncementsManager";

export default async function AdminAnnouncementsPage() {
  await requireAdminOrRedirect();
  const items = await listAnnouncements();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">공지사항</h1>
        <Link href="/admin" className="inline-flex items-center gap-0.5 text-[13px] font-medium text-muted transition-colors hover:text-foreground">
          <ChevronLeft size={15} strokeWidth={1.8} aria-hidden />
          대시보드로
        </Link>
      </div>
      <AnnouncementsManager initialItems={items} />
    </div>
  );
}
