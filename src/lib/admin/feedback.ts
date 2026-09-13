import { getServiceClient } from "@/lib/supabase/service-client";

export interface FeedbackItem {
  id: string;
  created_at: string;
  message: string;
  /** feedback_submissions.user_id는 로그인 사용자만 채워짐(비로그인은 null) —
   * 개별 이메일까지는 안 보여준다(11-6 원칙: 관리자 대시보드는 식별 정보를
   * 최소화). 로그인 여부만 표시. */
  from_logged_in_user: boolean;
}

/** feedback_submissions는 select RLS 정책이 아예 없어(insert만 허용)
 * service_role로만 읽을 수 있다 — 관리자 라우트에서만 호출할 것. */
export async function listFeedback(limit = 100): Promise<FeedbackItem[]> {
  const { data, error } = await getServiceClient()
    .from("feedback_submissions")
    .select("id, created_at, message, user_id")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`피드백 조회 실패: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    message: row.message,
    from_logged_in_user: row.user_id !== null,
  }));
}
