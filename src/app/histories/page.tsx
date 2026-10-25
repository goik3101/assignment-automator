import Link from "next/link";
import { FileText, Wrench } from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { getSessionUser } from "@/lib/supabase/session-user";
import DeleteHistoryButton from "@/components/DeleteHistoryButton";
import { getTrashedSubmissionIds } from "@/lib/histories/trash";
import { getT } from "@/lib/i18n/server";

// F7: 과거 히스토리 조회 (로그인 사용자). RLS 덕분에 이 쿼리는 자동으로 본인 것만
// 가져온다 — user_id로 따로 필터링할 필요가 없다 (server-client.ts, RLS 정책 참고).
// 처음엔 최근 50개만 보여주고 "더 보기"로 50개씩 늘린다 — 결과물이 많은 사용자는 한 번에 수백 개를 그리느라 HTML이 1MB를 넘고 오래 걸렸다.
const PAGE_SIZE = 50;
const MAX_LIMIT = 500;

export default async function HistoriesPage(props: PageProps<"/histories">) {
  const { t, lang } = await getT();
  const locale = lang === "en" ? "en-US" : "ko-KR";
  const rawLimit = Number((await props.searchParams).limit);
  const limit = Number.isFinite(rawLimit) ? Math.min(MAX_LIMIT, Math.max(PAGE_SIZE, Math.floor(rawLimit))) : PAGE_SIZE;
  const supabase = await getServerSupabase();
  const user = await getSessionUser(supabase);

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 md:px-10">
        <p className="text-sm text-muted">{t("로그인하면 만든 결과물의 히스토리를 볼 수 있어요.")}</p>
      </div>
    );
  }

  // 목록과 휴지통 목록을 동시에 가져온다. 한 개 더(limit+1) 읽어서 "더 보기"가 필요한지 안다.
  const [{ data: allHistories, error }, { ids: trashed }] = await Promise.all([
    supabase
      .from("user_histories")
      .select("id, submission_id, created_at, subject, title, output_type")
      .eq("is_current", true)
      .order("created_at", { ascending: false })
      .limit(limit + 1),
    getTrashedSubmissionIds(supabase),
  ]);
  const hasMore = (allHistories?.length ?? 0) > limit;
  const histories = allHistories?.slice(0, limit).filter((h) => !trashed.has(h.submission_id));

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      <h1 className="text-2xl font-bold tracking-tight">{t("히스토리")}</h1>
      <p className="mb-8 mt-1.5 text-sm text-muted">{t("AI가 만들어 준 결과물을 만든 순서대로 모았어요.")}</p>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {t("히스토리를 불러오지 못했어요. 새로고침해 주세요.")}
        </p>
      )}
      {!error && (!histories || histories.length === 0) && (
        <p className="text-sm text-muted">{t("아직 만든 결과물이 없어요. 왼쪽의 “새 창작물”로 시작해 보세요.")}</p>
      )}

      <ul className="space-y-2">
        {histories?.map((h) => (
          <li
            key={h.id}
            className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3.5 transition-colors hover:border-border-strong"
          >
            <Link href={`/histories/${h.id}`} className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-[15px] font-semibold">{h.title || h.subject}</span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted">
                  {h.output_type === "essay" ? <FileText size={13} strokeWidth={1.7} /> : <Wrench size={13} strokeWidth={1.7} />}
                  {h.output_type === "essay" ? t("완성 원고") : t("실행 계획")}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                <span>{h.subject}</span>
                <span>·</span>
                <span>{new Date(h.created_at).toLocaleDateString(locale)}</span>
              </div>
            </Link>
            <DeleteHistoryButton id={h.id} />
          </li>
        ))}
      </ul>
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <Link
            href={`/histories?limit=${Math.min(MAX_LIMIT, limit + PAGE_SIZE)}`}
            scroll={false}
            className="rounded-full border border-border-strong px-4 py-2 text-[13px] font-medium text-muted transition-colors hover:bg-raised hover:text-foreground"
          >
            {t("더 보기")}
          </Link>
        </div>
      )}
    </div>
  );
}
