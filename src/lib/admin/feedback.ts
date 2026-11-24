import { getServiceClient } from "@/lib/supabase/service-client";
import { FEEDBACK_BUCKET, type FeedbackAttachment } from "@/lib/feedback/attachments";

export interface FeedbackItem {
  id: string;
  created_at: string;
  message: string;
  /** "이메일(계정)로 보내기"를 고른 로그인 사용자인가. 익명은 false. */
  from_logged_in_user: boolean;
  /** 계정으로 보낸 경우에만 그 계정의 이메일(답장·문의 응대용). 익명·개선 돕기는 null — 개선 돕기는 어떤 경우에도 계정과 잇지 않는다. */
  email: string | null;
  /** 개발자 답변(없으면 null). 계정으로 보낸 피드백에만 달 수 있다. */
  reply: string | null;
  replied_at: string | null;
  /** 첨부 이미지. url은 비공개 버킷의 임시 주소(1시간)라 화면을 열 때마다 새로 만든다. */
  attachments: { name: string; url: string }[];
}

type Row = {
  id: string;
  created_at: string;
  message: string;
  user_id: string | null;
  attachments?: FeedbackAttachment[] | null;
  reply?: string | null;
  replied_at?: string | null;
};

// 마이그레이션(0023 attachments, 0024 reply)이 아직 안 된 DB에서도 글은 보이도록 열을 줄여 가며 읽는다.
const SELECTS = [
  "id, created_at, message, user_id, attachments, reply, replied_at",
  "id, created_at, message, user_id, attachments",
  "id, created_at, message, user_id",
];

/** feedback_submissions는 select RLS 정책이 아예 없어(insert만 허용)
 * service_role로만 읽을 수 있다 — 관리자 라우트에서만 호출할 것. */
export async function listFeedback(limit = 100): Promise<FeedbackItem[]> {
  const db = getServiceClient();
  let rows: Row[] | null = null;
  let lastError = "";
  for (const columns of SELECTS) {
    const res = await db.from("feedback_submissions").select(columns).order("created_at", { ascending: false }).limit(limit);
    if (!res.error) {
      rows = (res.data ?? []) as unknown as Row[];
      break;
    }
    lastError = res.error.message;
  }
  if (!rows) throw new Error(`피드백 조회 실패: ${lastError}`);

  const paths = rows.flatMap((r) => (r.attachments ?? []).map((a) => a.path));
  const urlByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await db.storage.from(FEEDBACK_BUCKET).createSignedUrls(paths, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) urlByPath.set(s.path, s.signedUrl);
  }

  const ids = [...new Set(rows.flatMap((r) => (r.user_id ? [r.user_id] : [])))];
  const emailById = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      const u = await db.auth.admin.getUserById(id);
      if (u.data.user?.email) emailById.set(id, u.data.user.email);
    }),
  );

  return rows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    message: row.message,
    from_logged_in_user: row.user_id !== null,
    email: row.user_id ? (emailById.get(row.user_id) ?? null) : null,
    reply: row.reply ?? null,
    replied_at: row.replied_at ?? null,
    attachments: (row.attachments ?? []).flatMap((a) => {
      const url = urlByPath.get(a.path);
      return url ? [{ name: a.name, url }] : [];
    }),
  }));
}
