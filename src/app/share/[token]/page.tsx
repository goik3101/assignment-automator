import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/supabase/service-client";
import { EssayPanel, PlanPanel } from "@/components/ResultPanel";
import type { EssayResult, PlanResult } from "@/types/task";

// 공유 링크로 접속하는 공개 읽기 전용 페이지 — 로그인 불필요. share_token은
// capability URL(토큰 자체가 열쇠) 방식이라 RLS를 새로 열지 않고, service
// client로 "이 토큰과 정확히 일치하는 행"만 조회한다. 화면에 필요한 컬럼만
// 명시적으로 골라서 user_id 같은 계정 식별 정보가 응답에 아예 섞이지 않게 한다.
export default async function SharedResultPage(props: PageProps<"/share/[token]">) {
  const { token } = await props.params;

  const supabase = getServiceClient();
  const { data: history } = await supabase
    .from("user_histories")
    .select("title, subject, output_type, created_at, raw_text_result")
    .eq("share_token", token)
    .maybeSingle();

  if (!history) notFound();

  let result: EssayResult | PlanResult | null = null;
  try {
    result = JSON.parse(history.raw_text_result);
  } catch {
    result = null;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <div className="rounded-md border border-accent/30 bg-accent/5 px-4 py-2.5 text-xs text-muted">
        다른 학생이 studed로 만든 결과물을 공유받아 보고 있어요 (읽기 전용).
      </div>

      <div>
        <h1 className="text-lg font-semibold tracking-tight">{history.title || history.subject}</h1>
        <p className="mt-1 text-xs text-muted">
          {history.subject} · {new Date(history.created_at).toLocaleString("ko-KR")}
        </p>
      </div>

      {result ? (
        result.type === "essay" ? (
          <EssayPanel label={history.title ?? history.subject ?? ""} result={result} />
        ) : (
          <PlanPanel label={history.title ?? history.subject ?? ""} result={result} />
        )
      ) : (
        <p className="text-sm text-red-600">결과를 불러오지 못했습니다.</p>
      )}
    </div>
  );
}
