"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquare, X } from "lucide-react";
import { useAuth } from "@/lib/supabase/use-auth";
import { useT } from "@/lib/i18n";
import { notifyTutorUpdated, onTutorUpdated } from "@/lib/ui/tutor-events";

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
    if (!window.confirm(t("“{title}” 대화를 지울까요? 지운 대화는 되돌릴 수 없어요.", { title: c.title }))) return;
    const res = await fetch(`/api/tutor/conversations/${c.id}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) return;
    if (pathname === `/tutor/${c.id}`) router.push("/tutor");
    notifyTutorUpdated();
  }

  if (!user) return <div className="flex-1" />;

  return (
    <div className="mt-6 flex min-h-0 flex-1 flex-col px-3">
      <p className="mb-1.5 px-3 text-xs font-semibold text-faint">{t("작업 목록")}</p>
      {items && items.length === 0 && <p className="px-3 text-xs leading-relaxed text-faint">{t("AI 튜터와 나눈 대화가 여기에 쌓여요")}</p>}
      <ul className="min-h-0 space-y-0.5 overflow-y-auto">
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
                  "flex h-9 items-center gap-2.5 rounded-lg pl-3 pr-8 text-[13px] transition-colors",
                  active ? "bg-raised text-foreground" : "text-muted hover:bg-raised hover:text-foreground",
                ].join(" ")}
              >
                <MessageSquare size={14} strokeWidth={1.8} className="shrink-0" aria-hidden />
                <span className="truncate">{c.title}</span>
              </Link>
              <button
                onClick={() => void remove(c)}
                aria-label={t("대화 지우기")}
                title={t("대화 지우기")}
                className="absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-faint opacity-0 transition-opacity hover:bg-border-strong hover:text-foreground focus:opacity-100 group-hover:opacity-100"
              >
                <X size={13} strokeWidth={1.9} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
