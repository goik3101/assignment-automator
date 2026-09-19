import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 휴지통에 들어간 제출(submission) id 집합. 0014 마이그레이션이 아직 적용되지 않아
 * trashed_histories 표가 없으면 빈 집합을 돌려준다 — 이 경우 기존 화면은 예전과 똑같이
 * 동작해야 하므로 오류로 만들지 않는다. 세션 클라이언트(RLS)로만 조회한다.
 */
export async function getTrashedSubmissionIds(
  supabase: SupabaseClient
): Promise<{ ids: Set<string>; available: boolean }> {
  const { data, error } = await supabase.from("trashed_histories").select("submission_id");
  if (error) return { ids: new Set(), available: false };
  return { ids: new Set((data ?? []).map((r) => r.submission_id as string)), available: true };
}
