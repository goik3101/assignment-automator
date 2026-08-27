import { getServiceClient } from "@/lib/supabase/service-client";
import type { RequestIdentity } from "@/lib/auth/identity";

// 기획서 11-3, 11-5: 잠정값. 배포 전 목표 트래픽 대비 재계산할 것 (19번 챕터).
const GLOBAL_SOFT_LIMIT = Number(process.env.THROTTLE_GLOBAL_SOFT_LIMIT ?? 500);
const GLOBAL_HARD_MULTIPLIER = Number(process.env.THROTTLE_GLOBAL_HARD_MULTIPLIER ?? 5);
const LOGGED_IN_DAILY_LIMIT = Number(process.env.THROTTLE_LOGGED_IN_DAILY_LIMIT ?? 2);
// 9-5: "하루 1회 수정 가능 (생성 횟수와 별개 카운트)"
const REGENERATION_DAILY_LIMIT = Number(process.env.THROTTLE_REGENERATION_DAILY_LIMIT ?? 1);
const SOFT_THROTTLE_DELAY_MS = Number(process.env.THROTTLE_SOFT_DELAY_MS ?? 3000);

/** 사용자에게 그대로 보여줘도 되는 안내 메시지를 담은 에러. */
export class LimitExceededError extends Error {}

function todayStartIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** N3: 전체 상한(소프트/하드). 생성·재생성 모두에 공통으로 적용된다. */
async function checkGlobalThrottle(): Promise<void> {
  const supabase = getServiceClient();
  const { count: globalCount, error: globalError } = await supabase
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .gte("created_at", todayStartIso());
  if (globalError) throw new Error(`사용량 조회 실패: ${globalError.message}`);
  const total = globalCount ?? 0;

  if (total >= GLOBAL_SOFT_LIMIT * GLOBAL_HARD_MULTIPLIER) {
    throw new LimitExceededError(
      "지금 이용자가 너무 많아 서비스가 일시적으로 중단되었습니다. 잠시 후 다시 시도해주세요."
    );
  }
  if (total >= GLOBAL_SOFT_LIMIT) {
    // 소프트 스로틀링: 막지는 않되 살짝 지연시켜서 순간 부하를 완화한다.
    await new Promise((resolve) => setTimeout(resolve, SOFT_THROTTLE_DELAY_MS));
  }
}

/**
 * N3(전체 상한)·N4(비로그인 1회)·11-3(로그인 하루 2회) 규칙을 한 번에 검사한다.
 * isAdmin이면 11-6에 따라 모든 제한을 건너뛴다.
 */
export async function enforceGenerationLimit(
  identity: RequestIdentity,
  isAdmin = false
): Promise<void> {
  if (isAdmin) return;

  const supabase = getServiceClient();
  await checkGlobalThrottle();
  const todayStart = todayStartIso();

  if (identity.userId) {
    const { count: userCount, error: userError } = await supabase
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", identity.userId)
      .eq("event_type", "generate")
      .gte("created_at", todayStart);
    if (userError) throw new Error(`사용량 조회 실패: ${userError.message}`);
    if ((userCount ?? 0) >= LOGGED_IN_DAILY_LIMIT) {
      throw new LimitExceededError(
        `오늘 생성 가능한 횟수(${LOGGED_IN_DAILY_LIMIT}회)를 모두 사용했어요. 내일 다시 시도해주세요.`
      );
    }
    return;
  }

  if (identity.guestId) {
    // 비로그인은 "하루"가 아니라 평생 1회 — created_at 필터를 두지 않는다.
    const { count: guestCount, error: guestError } = await supabase
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("guest_id", identity.guestId)
      .eq("event_type", "generate");
    if (guestError) throw new Error(`사용량 조회 실패: ${guestError.message}`);
    if ((guestCount ?? 0) >= 1) {
      throw new LimitExceededError(
        "비로그인 상태에서는 1회만 무료로 이용할 수 있어요. 계속 이용하려면 로그인해주세요."
      );
    }
    return;
  }

  throw new LimitExceededError("로그인이 필요합니다.");
}

/**
 * 9-5/11-3: 재생성은 로그인 사용자만, 하루 1회. 생성 횟수(enforceGenerationLimit)와는
 * 별개 카운터다.
 */
export async function enforceRegenerationLimit(userId: string, isAdmin = false): Promise<void> {
  if (isAdmin) return;
  await checkGlobalThrottle();

  const supabase = getServiceClient();
  const { count, error } = await supabase
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("event_type", "regenerate")
    .gte("created_at", todayStartIso());
  if (error) throw new Error(`사용량 조회 실패: ${error.message}`);
  if ((count ?? 0) >= REGENERATION_DAILY_LIMIT) {
    throw new LimitExceededError(
      `오늘 수정 가능한 횟수(${REGENERATION_DAILY_LIMIT}회)를 모두 사용했어요. 내일 다시 시도해주세요.`
    );
  }
}

export async function recordGeneration(
  identity: RequestIdentity,
  eventType: "generate" | "regenerate" = "generate",
  avoidanceTriggered = false
): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.from("usage_events").insert({
    user_id: identity.userId,
    guest_id: identity.guestId,
    event_type: eventType,
    avoidance_triggered: avoidanceTriggered,
  });
  if (error) console.error("[throttle] 사용량 기록 실패", error);
}
