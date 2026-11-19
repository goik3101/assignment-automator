import { getServiceClient } from "@/lib/supabase/service-client";
import { FEEDBACK_BUCKET, type FeedbackAttachment } from "@/lib/feedback/attachments";

export interface FeedbackItem {
  id: string;
  created_at: string;
  message: string;
  /** feedback_submissions.user_id는 로그인 사용자만 채워짐(비로그인은 null) —
   * 개별 이메일까지는 안 보여준다(11-6 원칙: 관리자 대시보드는 식별 정보를
   * 최소화). 로그인 여부만 표시. */
  from_logged_in_user: boolean;
  /** 첨부 이미지. url은 비공개 버킷의 임시 주소(1시간)라 화면을 열 때마다 새로 만든다. */
  attachments: { name: string; url: string }[];
}

/** feedback_submissions는 select RLS 정책이 아예 없어(insert만 허용)
 * service_role로만 읽을 수 있다 — 관리자 라우트에서만 호출할 것. */
export async function listFeedback(limit = 100): Promise<FeedbackItem[]> {
  const db = getServiceClient();
  let rows: { id: string; created_at: string; message: string; user_id: string | null; attachments?: FeedbackAttachment[] | null }[];

  const withFiles = await db
    .from("feedback_submissions")
    .select("id, created_at, message, user_id, attachments")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (withFiles.error) {
    // 0023 마이그레이션 전이면 attachments 열이 없다 — 글만이라도 보여준다.
    const plain = await db
      .from("feedback_submissions")
      .select("id, created_at, message, user_id")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (plain.error) throw new Error(`피드백 조회 실패: ${plain.error.message}`);
    rows = plain.data ?? [];
  } else {
    rows = withFiles.data ?? [];
  }

  const paths = rows.flatMap((r) => (r.attachments ?? []).map((a) => a.path));
  const urlByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await db.storage.from(FEEDBACK_BUCKET).createSignedUrls(paths, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  }

  return rows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    message: row.message,
    from_logged_in_user: row.user_id !== null,
    attachments: (row.attachments ?? []).flatMap((a) => {
      const url = urlByPath.get(a.path);
      return url ? [{ name: a.name, url }] : [];
    }),
  }));
}
