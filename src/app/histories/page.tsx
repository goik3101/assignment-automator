import Link from "next/link";
import { FileText, Wrench } from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server-client";
import DeleteHistoryButton from "@/components/DeleteHistoryButton";
import { getTrashedSubmissionIds } from "@/lib/histories/trash";
import { getT } from "@/lib/i18n/server";

// F7: 과거 히스토리 조회 (로그인 사용자). RLS 덕분에 이 쿼리는 자동으로 본인 것만
// 가져온다 — user_id로 따로 필터링할 필요가 없다 (server-client.ts, RLS 정책 참고).
export default async function HistoriesPage() {
  const { t, lang } = await getT();
  const locale = lang === "en" ? "en-US" : "ko-KR";
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 md:px-10">
        <p className="text-sm text-muted">{t("로그인하면 만든 결과물의 히스토리를 볼 수 있어요.")}</p>
      </div>
    );
  }

  const { data: allHistories, error } = await supabase
    .from("user_histories")
    .select("id, submission_id, created_at, subject, title, output_type")
    .eq("is_current", true)
    .order("created_at", { ascending: false });

  const { ids: trashed } = await getTrashedSubmissionIds(supabase);
  const histories = allHistories?.filter((h) => !trashed.has(h.submission_id));

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
    </div>
  );
}
