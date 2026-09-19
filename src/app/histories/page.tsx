import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server-client";
import DeleteHistoryButton from "@/components/DeleteHistoryButton";

// F7: 과거 히스토리 조회 (로그인 사용자). RLS 덕분에 이 쿼리는 자동으로 본인 것만
// 가져온다 — user_id로 따로 필터링할 필요가 없다 (server-client.ts, RLS 정책 참고).
export default async function HistoriesPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <p className="text-sm text-muted">히스토리를 보려면 로그인해주세요.</p>
      </div>
    );
  }

  const { data: histories, error } = await supabase
    .from("user_histories")
    .select("id, created_at, subject, title, output_type")
    .eq("is_current", true)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-6 text-[22px] font-bold tracking-tight">히스토리</h1>

      {error && <p className="text-sm text-red-600">불러오는 중 오류가 발생했습니다.</p>}
      {!error && (!histories || histories.length === 0) && (
        <p className="text-sm text-muted">아직 생성한 결과물이 없어요.</p>
      )}

      <ul className="space-y-2">
        {histories?.map((h) => (
          <li
            key={h.id}
            className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-accent"
          >
            <Link href={`/histories/${h.id}`} className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{h.title || h.subject}</span>
                <span className="shrink-0 text-xs text-muted">
                  {h.output_type === "essay" ? "완성 원고" : "실행 계획"}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                <span>{h.subject}</span>
                <span>·</span>
                <span>{new Date(h.created_at).toLocaleDateString("ko-KR")}</span>
              </div>
            </Link>
            <DeleteHistoryButton id={h.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}
