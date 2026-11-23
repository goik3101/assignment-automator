// 문의·피드백과 "개선 돕기"로 받은 안내문 사진·결과물을 받은 날부터 1년 뒤 지운다(개인정보처리방침 2항의 약속).
// 매일 한 번 Vercel Cron이 /api/cron/purge-feedback을 부른다. alias import 없음 — 가짜 DB로 node:test에서 바로 시험한다.
import { FEEDBACK_BUCKET } from "./attachments.ts";

export const FEEDBACK_RETENTION_DAYS = 365;
const ROUND_SIZE = 100;
const MAX_ROUNDS = 5;

/** 이 시각보다 먼저 받은 것은 지운다. */
export function feedbackCutoff(now: Date): string {
  return new Date(now.getTime() - FEEDBACK_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * 크론 호출인지 확인한다. CRON_SECRET이 설정돼 있으면 Vercel이 보내는 `Authorization: Bearer <값>`이 맞아야 한다.
 * 설정이 없으면 Vercel 크론의 user-agent만 확인한다 — 이 경로는 "1년 지난 것을 지운다"는 같은 일만 하므로(입력 없음·되풀이해도 결과 같음) 오남용돼도 방침대로 지워질 뿐이다.
 */
export function isCronAuthorized(authorization: string | null, userAgent: string | null, secret: string | undefined): boolean {
  if (secret) return authorization === `Bearer ${secret}`;
  return (userAgent ?? "").startsWith("vercel-cron/");
}

interface PurgeDb {
  // Supabase 클라이언트의 모양만 쓴다(테스트에서 가짜로 갈아 끼운다).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
  storage: { from(bucket: string): { remove(paths: string[]): Promise<{ error: unknown }> } };
}

export interface PurgeResult {
  deleted: number;
  files: number;
  /** 저장소에서 파일을 못 지워 그날 중단했으면 true — 행은 남겨 두고 다음 날 다시 시도한다(파일만 남는 일을 막는다). */
  stopped: boolean;
}

export async function purgeExpiredFeedback(db: PurgeDb, now: Date = new Date()): Promise<PurgeResult> {
  const cutoff = feedbackCutoff(now);
  const result: PurgeResult = { deleted: 0, files: 0, stopped: false };
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let rows: { id: string; attachments?: { path: string }[] | null }[] = [];
    const withFiles = await db.from("feedback_submissions").select("id, attachments").lt("created_at", cutoff).limit(ROUND_SIZE);
    if (withFiles.error) {
      // 0023 마이그레이션 전이면 attachments 열이 없다 — 행만이라도 지운다.
      const plain = await db.from("feedback_submissions").select("id").lt("created_at", cutoff).limit(ROUND_SIZE);
      if (plain.error) throw new Error(`만료 피드백 조회 실패: ${plain.error.message ?? plain.error}`);
      rows = plain.data ?? [];
    } else {
      rows = withFiles.data ?? [];
    }
    if (rows.length === 0) break;

    const paths = rows.flatMap((r) => (r.attachments ?? []).map((a) => a.path));
    if (paths.length > 0) {
      const { error } = await db.storage.from(FEEDBACK_BUCKET).remove(paths);
      if (error) {
        result.stopped = true;
        break;
      }
      result.files += paths.length;
    }
    const del = await db.from("feedback_submissions").delete().in("id", rows.map((r) => r.id));
    if (del.error) throw new Error(`만료 피드백 삭제 실패: ${del.error.message ?? del.error}`);
    result.deleted += rows.length;
    if (rows.length < ROUND_SIZE) break;
  }
  return result;
}
