import { notFound } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server-client";
import { EssayPanel, PlanPanel } from "@/components/ResultPanel";
import MemoNoteTabs from "@/components/MemoNoteTabs";
import type { EssayResult, PlanResult } from "@/types/task";

export default async function HistoryDetailPage(props: PageProps<"/histories/[id]">) {
  const { id } = await props.params;
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-sm text-muted">로그인이 필요합니다.</p>
      </div>
    );
  }

  // RLS(auth.uid() = user_id) 덕분에 다른 사용자의 id를 넣어도 조회되지 않는다.
  const { data: history } = await supabase.from("user_histories").select("*").eq("id", id).single();
  if (!history) notFound();

  let result: EssayResult | PlanResult | null = null;
  try {
    result = JSON.parse(history.raw_text_result);
    // 저장된 원본 JSON에는 submissionId가 없다(생성 시점엔 API 응답에만 따로
    // 얹혔음) — 공유 링크 버튼이 뜨려면 필요하므로 DB 컬럼값으로 채워 넣는다.
    if (result) result.submissionId = history.submission_id;
  } catch {
    result = null;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{history.title || history.subject}</h1>
        <p className="mt-1 text-xs text-muted">
          {history.subject} · {new Date(history.created_at).toLocaleString("ko-KR")}
        </p>
      </div>

      {result ? (
        <MemoNoteTabs historyId={history.id}>
          {result.type === "essay" ? (
            <EssayPanel label={history.title} result={result} />
          ) : (
            <PlanPanel label={history.title} result={result} />
          )}
        </MemoNoteTabs>
      ) : (
        <p className="text-sm text-red-600">결과를 불러오지 못했습니다.</p>
      )}
    </div>
  );
}
