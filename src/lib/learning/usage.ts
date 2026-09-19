import { getServiceClient } from "@/lib/supabase/service-client";
import type { LearningUsage } from "@/types/learning";

// 학습 모드의 AI 호출(자료 조사 + 피드백)은 합쳐서 하루 N회로 제한한다(기본 5회).
// throttle.ts(자동 작성 모드의 usage_events)와 완전히 별개 카운터다 — 그쪽 CHECK
// 제약을 건드리지 않고 learning_usage_events를 따로 쓴다. 관리자는 예외.
export const LEARNING_DAILY_LIMIT = Number(process.env.LEARNING_DAILY_LIMIT ?? 5);

/** 사용자에게 그대로 보여줘도 되는 안내 메시지를 담은 에러. */
export class LearningLimitError extends Error {}

function todayStartIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function getLearningUsage(userId: string, isAdmin: boolean): Promise<LearningUsage> {
  if (isAdmin) return { used: 0, limit: LEARNING_DAILY_LIMIT, unlimited: true };
  const { count, error } = await getServiceClient()
    .from("learning_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", todayStartIso());
  if (error) throw new Error(`학습 모드 사용량 조회 실패: ${error.message}`);
  return { used: count ?? 0, limit: LEARNING_DAILY_LIMIT, unlimited: false };
}

export async function enforceLearningLimit(userId: string, isAdmin: boolean): Promise<void> {
  const usage = await getLearningUsage(userId, isAdmin);
  if (!usage.unlimited && usage.used >= usage.limit) {
    throw new LearningLimitError(
      `오늘 사용할 수 있는 학습 모드 AI 횟수(자료 조사·피드백 합쳐 ${usage.limit}회)를 모두 썼어요. 내일 다시 이용해주세요. 작성한 내용은 그대로 저장돼 있어요.`
    );
  }
}

/** AI 호출이 성공한 뒤에만 기록한다 — 실패한 호출은 횟수를 차감하지 않는다. */
export async function recordLearningUsage(userId: string, kind: "research" | "feedback"): Promise<void> {
  const { error } = await getServiceClient().from("learning_usage_events").insert({ user_id: userId, kind });
  if (error) console.error("[learning usage] 기록 실패", error);
}
