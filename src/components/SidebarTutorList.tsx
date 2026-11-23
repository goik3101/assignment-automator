"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Ellipsis, MessageSquare, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/supabase/use-auth";
import { useT } from "@/lib/i18n";
import { notifyTutorUpdated, onTutorUpdated } from "@/lib/ui/tutor-events";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Conversation {
  id: string;
  title: string;
}

// AI 튜터 화면의 사이드바 "작업 목록": 튜터와 나눈 대화만 보여준다(메인의 작업 목록은 이 화면에서 보이지 않는다).
export default function SidebarTutorList({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [target, setTarget] = useState<Conversation | null>(null);

  const load = useCallback(() => {
    if (!user) return Promise.resolve();
    return fetch("/api/tutor/conversations")
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((d) => setItems(((d as { conversations?: Conversation[] } | null)?.conversations ?? []) as Conversation[]));
  }, [user]);

  useEffect(() => {
    // 화면을 옮기거나 새 대화가 저장될 때마다 목록을 다시 읽는다 — 외부 데이터 불러오기.
    void load();
    return onTutorUpdated(() => void load());
  }, [load, pathname]);

  async function remove(c: Conversation) {
    const res = await fetch(`/api/tutor/conversations/${c.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return;
    if (pathname === `/tutor/${c.id}`) router.push("/tutor");
    notifyTutorUpdated();
  }

  if (!user) return <div className="flex-1" />;

  return (
    <div className="mt-6 flex flex-col px-3 pb-2">
      <p className="mb-1.5 px-3 text-xs font-medium text-faint">{t("최근")}</p>
      {items && items.length === 0 && <p className="px-3 text-xs leading-relaxed text-faint">{t("AI 튜터와 나눈 대화가 여기에 쌓여요")}</p>}
      <ul className="space-y-0.5">
        {(items ?? []).map((c) => {
          const href = `/tutor/${c.id}`;
          const active = pathname === href;
          return (
            <li key={c.id} className="group relative">
              <Link
                href={href}
                onClick={onNavigate}
                title={c.title}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex h-9 items-center gap-3 rounded-lg pl-3 pr-8 text-[13.5px] transition-colors",
                  active ? "bg-raised font-semibold text-foreground" : "text-foreground hover:bg-raised",
                ].join(" ")}
              >
                <MessageSquare size={16} strokeWidth={1.7} className="shrink-0 text-faint" aria-hidden />
                <span className="truncate">{c.title}</span>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label={t("더보기")}
                  className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted opacity-0 transition-opacity hover:bg-border-strong hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-popup-open:bg-border-strong data-popup-open:opacity-100"
                >
                  <Ellipsis size={15} strokeWidth={1.8} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40 min-w-0">
                  <DropdownMenuItem variant="destructive" onClick={() => setTarget(c)}>
                    <Trash2 size={14} strokeWidth={1.7} />
                    {t("대화 지우기")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>
      <AlertDialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("대화 지우기")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("“{title}” 대화를 지울까요? 지운 대화는 되돌릴 수 없어요.", { title: target?.title ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("취소")}</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={() => target && void remove(target)}>
              {t("삭제")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
