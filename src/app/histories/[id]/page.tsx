import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import Breadcrumb from "@/components/Breadcrumb";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { getSessionUser } from "@/lib/supabase/session-user";
import { EssayPanel, PlanPanel } from "@/components/ResultPanel";
import StudyRail from "@/components/study/StudyRail";
import type { EssayResult, PlanResult } from "@/types/task";
import { getT } from "@/lib/i18n/server";

export default async function HistoryDetailPage(props: PageProps<"/histories/[id]">) {
  const { id } = await props.params;
  const { t, lang } = await getT();
  const supabase = await getServerSupabase();
  const user = await getSessionUser(supabase);

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-sm text-muted">{t("로그인하면 만든 결과물을 볼 수 있어요.")}</p>
      </div>
    );
  }

  // RLS(auth.uid() = user_id) 덕분에 다른 사용자의 id를 넣어도 조회되지 않는다.
  const { data: history } = await supabase.from("user_histories").select("*").eq("id", id).single();
  if (!history) notFound();

  let result: EssayResult | PlanResult | null = null;
  try {
    result = JSON.parse(history.raw_text_result);
    // 저장된 원본 JSON에는 submissionId가 없다(생성 시점엔 API 응답에만 따로 얹혔음) —
    // 공유 링크 버튼이 뜨려면 필요하므로 DB 컬럼값으로 채워 넣는다.
    if (result) result.submissionId = history.submission_id;
  } catch {
    result = null;
  }

  const title = history.title || history.subject;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-8 md:px-10">
      <Breadcrumb title={title} />
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 flex items-center gap-2 text-[13px] text-muted">
          <Sparkles size={13} strokeWidth={1.7} aria-label={t("AI 모드")} />
          {history.subject}
          <span aria-hidden>·</span>
          {new Date(history.created_at).toLocaleDateString(lang === "en" ? "en-US" : "ko-KR", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          {result ? (
            result.type === "essay" ? (
              <EssayPanel label={title} result={result} hideHeading />
            ) : (
              <PlanPanel label={title} result={result} hideHeading />
            )
          ) : (
            <p role="alert" className="rounded-xl border border-danger/50 px-4 py-3 text-sm text-danger">
              {t("결과를 불러오지 못했어요. 새로고침해도 안 되면 문의해 주세요.")}
            </p>
          )}
        </div>
        <StudyRail
          studyRef={{ kind: "history", id: history.id }}
          title={title}
        />
      </div>
    </div>
  );
}
