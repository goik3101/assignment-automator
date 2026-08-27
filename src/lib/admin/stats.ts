import { getServiceClient } from "@/lib/supabase/service-client";

export interface AdminStats {
  generations: { today: number; last7Days: number; last30Days: number };
  regenerations: { today: number; last30Days: number };
  /** 최근 30일 생성 요청 중 로그인/비로그인 비율 */
  loginRatio: { loggedIn: number; guest: number; total: number };
  /** 최근 30일 생성 요청 중 겹침 방지 회피 지시가 발동한 비율 (0~1) */
  avoidanceTriggeredRatio: number;
  /** 최근 30일 검증된 출처 링크 중 실패(연결 안 됨) 비율 (0~1) */
  sourceValidationFailureRatio: number;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function isoTodayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * 관리자 대시보드 지표 (11-6). 개별 이메일 등 개인 식별 정보는 절대 포함하지 않고
 * 집계 수치만 계산한다.
 */
export async function getAdminStats(): Promise<AdminStats> {
  const supabase = getServiceClient();
  const todayStart = isoTodayStart();
  const days7 = isoDaysAgo(7);
  const days30 = isoDaysAgo(30);
  const events = supabase.from("usage_events");
  const validations = supabase.from("source_validations");

  const [
    genToday,
    gen7,
    gen30,
    regenToday,
    regen30,
    loggedIn30,
    guest30,
    avoidance30,
    validationsTotal30,
    validationsFailed30,
  ] = await Promise.all([
    events.select("id", { count: "exact", head: true }).eq("event_type", "generate").gte("created_at", todayStart),
    events.select("id", { count: "exact", head: true }).eq("event_type", "generate").gte("created_at", days7),
    events.select("id", { count: "exact", head: true }).eq("event_type", "generate").gte("created_at", days30),
    events.select("id", { count: "exact", head: true }).eq("event_type", "regenerate").gte("created_at", todayStart),
    events.select("id", { count: "exact", head: true }).eq("event_type", "regenerate").gte("created_at", days30),
    events
      .select("id", { count: "exact", head: true })
      .eq("event_type", "generate")
      .not("user_id", "is", null)
      .gte("created_at", days30),
    events
      .select("id", { count: "exact", head: true })
      .eq("event_type", "generate")
      .not("guest_id", "is", null)
      .gte("created_at", days30),
    events
      .select("id", { count: "exact", head: true })
      .eq("event_type", "generate")
      .eq("avoidance_triggered", true)
      .gte("created_at", days30),
    validations.select("id", { count: "exact", head: true }).gte("created_at", days30),
    validations.select("id", { count: "exact", head: true }).eq("valid", false).gte("created_at", days30),
  ]);

  for (const r of [
    genToday,
    gen7,
    gen30,
    regenToday,
    regen30,
    loggedIn30,
    guest30,
    avoidance30,
    validationsTotal30,
    validationsFailed30,
  ]) {
    if (r.error) throw new Error(`통계 조회 실패: ${r.error.message}`);
  }

  const gen30Count = gen30.count ?? 0;
  const validationsTotal30Count = validationsTotal30.count ?? 0;

  return {
    generations: { today: genToday.count ?? 0, last7Days: gen7.count ?? 0, last30Days: gen30Count },
    regenerations: { today: regenToday.count ?? 0, last30Days: regen30.count ?? 0 },
    loginRatio: {
      loggedIn: loggedIn30.count ?? 0,
      guest: guest30.count ?? 0,
      total: (loggedIn30.count ?? 0) + (guest30.count ?? 0),
    },
    avoidanceTriggeredRatio: gen30Count > 0 ? (avoidance30.count ?? 0) / gen30Count : 0,
    sourceValidationFailureRatio:
      validationsTotal30Count > 0 ? (validationsFailed30.count ?? 0) / validationsTotal30Count : 0,
  };
}
