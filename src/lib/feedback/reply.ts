import { getServiceClient } from "@/lib/supabase/service-client";
import { REPLY_MAX, isFeedbackId } from "@/lib/feedback/identity";

export interface MyFeedback {
  id: string;
  created_at: string;
  message: string;
  reply: string | null;
  replied_at: string | null;
}

/** 이용자 본인이 "이메일로 보내기"를 골라 보낸 피드백과 그 답변. 0024 마이그레이션 전이면 답변 없이 글만 돌려준다. */
export async function listMyFeedback(userId: string, limit = 20): Promise<MyFeedback[]> {
  const db = getServiceClient();
  const full = await db
    .from("feedback_submissions")
    .select("id, created_at, message, reply, replied_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!full.error) return (full.data ?? []) as MyFeedback[];
  const plain = await db.from("feedback_submissions").select("id, created_at, message").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (plain.error) throw new Error(`내 피드백 조회 실패: ${plain.error.message}`);
  return (plain.data ?? []).map((r) => ({ ...(r as { id: string; created_at: string; message: string }), reply: null, replied_at: null }));
}

/** 관리자가 답변을 쓴다(빈 글이면 답변을 지운다). 계정에 묶인 피드백에만 답변을 달 수 있다 — 익명에는 보여 줄 대상이 없다. */
export async function saveReply(id: string, reply: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!isFeedbackId(id)) return { ok: false, status: 400, error: "잘못된 피드백 번호예요." };
  const text = reply.trim();
  if (text.length > REPLY_MAX) return { ok: false, status: 400, error: `답변은 ${REPLY_MAX.toLocaleString()}자까지 쓸 수 있어요.` };
  const db = getServiceClient();
  const row = await db.from("feedback_submissions").select("user_id").eq("id", id).maybeSingle();
  if (row.error) return { ok: false, status: 500, error: row.error.message };
  if (!row.data) return { ok: false, status: 404, error: "피드백을 찾지 못했어요." };
  if (!row.data.user_id) return { ok: false, status: 400, error: "익명 피드백에는 답변을 달 수 없어요." };
  const { error } = await db
    .from("feedback_submissions")
    .update({ reply: text || null, replied_at: text ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) {
    const missing = /reply|replied_at/.test(error.message);
    return { ok: false, status: 500, error: missing ? "답변 열이 아직 없어요. 마이그레이션 0024를 먼저 실행해 주세요." : error.message };
  }
  return { ok: true };
}
