import { getServiceClient } from "@/lib/supabase/service-client";
import type { RequestIdentity } from "@/lib/auth/identity";
import { withinLimit } from "./throttle-pure";

// 기획서 11-3, 11-5: 잠정값. 배포 전 목표 트래픽 대비 재계산할 것 (19번 챕터).
const GLOBAL_SOFT_LIMIT = Number(process.env.THROTTLE_GLOBAL_SOFT_LIMIT ?? 500);
const GLOBAL_HARD_MULTIPLIER = Number(process.env.THROTTLE_GLOBAL_HARD_MULTIPLIER ?? 5);
const LOGGED_IN_DAILY_LIMIT = Number(process.env.THROTTLE_LOGGED_IN_DAILY_LIMIT ?? 2);
// 9-5: "하루 1회 수정 가능 (생성 횟수와 별개 카운트)"
const REGENERATION_DAILY_LIMIT = Number(process.env.THROTTLE_REGENERATION_DAILY_LIMIT ?? 1);
const SOFT_THROTTLE_DELAY_MS = Number(process.env.THROTTLE_SOFT_DELAY_MS ?? 3000);

/** 사용자에게 그대로 보여줘도 되는 안내 메시지를 담은 에러. */
export class LimitExceededError extends Error {}

// 동시에 보낸 요청이 모두 "아직 한도 안"으로 통과하던 구멍(검사는 시작에, 기록은 끝에 했다 — 2026-10-24 비용 점검)을 막는다:
// 기록을 먼저 넣어 자리를 잡고, 오늘 기록 중 내 순서가 한도 안일 때만 통과시킨다. 생성이 실패하면 releaseGeneration으로 자리를 돌려준다.
// THROTTLE_RESERVE=off면 예전처럼 시작에 세고 끝에 기록한다.
const reserveOn = () => process.env.THROTTLE_RESERVE !== "off";


async function reserveSlot(
  owner: { column: "user_id" | "guest_id"; value: string },
  eventType: "generate" | "regenerate",
  limit: number,
  sinceIso: string | null,
  message: string
): Promise<string> {
  const supabase = getServiceClient();
  const { data: mine, error: insErr } = await supabase
    .from("usage_events")
    .insert({ [owner.column]: owner.value, event_type: eventType, avoidance_triggered: false })
    .select("id")
    .single();
  if (insErr || !mine) throw new Error(`사용량 기록 실패: ${insErr?.message ?? "no row"}`);
  let q = supabase.from("usage_events").select("id").eq(owner.column, owner.value).eq("event_type", eventType);
  if (sinceIso) q = q.gte("created_at", sinceIso);
  const { data: rows, error: selErr } = await q.order("created_at", { ascending: true }).order("id", { ascending: true }).limit(limit + 200);
  if (selErr) {
    await supabase.from("usage_events").delete().eq("id", mine.id);
    throw new Error(`사용량 조회 실패: ${selErr.message}`);
  }
  if (!withinLimit((rows ?? []).map((r) => r.id as string), mine.id as string, limit)) {
    await supabase.from("usage_events").delete().eq("id", mine.id);
    throw new LimitExceededError(message);
  }
  return mine.id as string;
}

/** 생성이 실패하거나 결과를 못 만들었으면 잡아 둔 자리를 돌려준다(학생 횟수에서 빠지지 않게). */
export async function releaseGeneration(reservationId: string | null): Promise<void> {
  if (!reservationId) return;
  const { error } = await getServiceClient().from("usage_events").delete().eq("id", reservationId);
  if (error) console.error("[throttle] 사용량 예약 해제 실패", error);
}

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
): Promise<string | null> {
  if (isAdmin) return null;

  const supabase = getServiceClient();
  await checkGlobalThrottle();
  const todayStart = todayStartIso();

  if (reserveOn() && identity.userId) {
    return reserveSlot({ column: "user_id", value: identity.userId }, "generate", LOGGED_IN_DAILY_LIMIT, todayStart,
      `오늘 생성 가능한 횟수(${LOGGED_IN_DAILY_LIMIT}회)를 모두 사용했어요. 내일 다시 시도해주세요.`);
  }
  if (reserveOn() && identity.guestId) {
    // 비로그인은 하루 1회(2026-10-24 출시 기준, 예전에는 평생 1회).
    return reserveSlot({ column: "guest_id", value: identity.guestId }, "generate", 1, todayStart,
      "비로그인 상태에서는 하루 1회만 무료로 이용할 수 있어요. 더 이용하려면 로그인해주세요.");
  }

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
    return null;
  }

  if (identity.guestId) {
    // 비로그인은 하루 1회.
    const { count: guestCount, error: guestError } = await supabase
      .from("usage_events")
      .select("id", { count: "exact", head: true })
      .eq("guest_id", identity.guestId)
      .eq("event_type", "generate")
      .gte("created_at", todayStart);
    if (guestError) throw new Error(`사용량 조회 실패: ${guestError.message}`);
    if ((guestCount ?? 0) >= 1) {
      throw new LimitExceededError(
        "비로그인 상태에서는 하루 1회만 무료로 이용할 수 있어요. 더 이용하려면 로그인해주세요."
      );
    }
    return null;
  }

  throw new LimitExceededError("로그인이 필요합니다.");
}

/**
 * 9-5/11-3: 재생성은 로그인 사용자만, 하루 1회. 생성 횟수(enforceGenerationLimit)와는
 * 별개 카운터다.
 */
export async function enforceRegenerationLimit(userId: string, isAdmin = false): Promise<string | null> {
  if (isAdmin) return null;
  await checkGlobalThrottle();
  if (reserveOn()) {
    return reserveSlot({ column: "user_id", value: userId }, "regenerate", REGENERATION_DAILY_LIMIT, todayStartIso(),
      `오늘 수정 가능한 횟수(${REGENERATION_DAILY_LIMIT}회)를 모두 사용했어요. 내일 다시 시도해주세요.`);
  }

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
  return null;
}

export async function recordGeneration(
  identity: RequestIdentity,
  eventType: "generate" | "regenerate" = "generate",
  avoidanceTriggered = false,
  /** enforce*Limit이 미리 잡아 둔 기록 — 있으면 새로 넣지 않고 그 기록을 확정한다. */
  reservationId: string | null = null
): Promise<void> {
  const supabase = getServiceClient();
  if (reservationId) {
    if (!avoidanceTriggered) return;
    const { error } = await supabase.from("usage_events").update({ avoidance_triggered: true }).eq("id", reservationId);
    if (error) console.error("[throttle] 사용량 기록 갱신 실패", error);
    return;
  }
  const { error } = await supabase.from("usage_events").insert({
    user_id: identity.userId,
    guest_id: identity.guestId,
    event_type: eventType,
    avoidance_triggered: avoidanceTriggered,
  });
  if (error) console.error("[throttle] 사용량 기록 실패", error);
}
