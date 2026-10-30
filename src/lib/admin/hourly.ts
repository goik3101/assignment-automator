import { getServiceClient } from "@/lib/supabase/service-client";
import { hourlyByDay, kstDayRange, type DayPoint } from "./dashboard-pure";

// 선택한 날(한국 시간)의 생성 횟수를 시간대(0~23시)별로 센다. 관리자 대시보드의 "시간대별 생성" 그래프용 — 개인 식별 정보는 읽지 않고 시각과 종류만 쓴다.
const PAGE = 1000;
const MAX_ROWS = 20_000;

export interface HourlyGenerations {
  day: string;
  /** day 필드가 "00"~"23"인 24개 막대. values: login(로그인 생성), guest(비로그인 생성), regen(재생성). */
  hours: DayPoint[];
  total: number;
  /** 가장 많았던 시간대. 기록이 없으면 null. */
  peak: { hour: number; count: number } | null;
  truncated: boolean;
}

export async function getHourlyGenerations(day: string): Promise<HourlyGenerations> {
  const { start, end } = kstDayRange(day);
  const supabase = getServiceClient();
  const rows: { created_at: string; event_type: string; user_id: string | null }[] = [];
  let truncated = false;

  for (let from = 0; ; from += PAGE) {
    if (from >= MAX_ROWS) {
      truncated = true;
      break;
    }
    const { data, error } = await supabase
      .from("usage_events")
      .select("created_at, event_type, user_id")
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`시간대별 조회 실패: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const hours = hourlyByDay(rows, day, (r) => r.created_at, (r): Record<string, number> =>
    r.event_type === "regenerate" ? { regen: 1 } : r.user_id ? { login: 1 } : { guest: 1 }
  );
  const totals = hours.map((p) => (p.values.login ?? 0) + (p.values.guest ?? 0) + (p.values.regen ?? 0));
  const peakCount = Math.max(...totals, 0);

  return {
    day,
    hours,
    total: totals.reduce((s, n) => s + n, 0),
    peak: peakCount > 0 ? { hour: totals.indexOf(peakCount), count: peakCount } : null,
    truncated,
  };
}
