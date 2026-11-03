import { getServiceClient } from "@/lib/supabase/service-client";
import { kstMonthRange, summarizeVisits, type VisitSummary } from "./visits-pure";

// 선택한 달의 방문 집계(site_visits, 마이그레이션 0020). 표가 아직 없으면 missing으로 알린다. 개인 식별 정보는 읽지 않는다.
const PAGE = 1000;
const MAX_ROWS = 50_000;

export type VisitsResult = (VisitSummary & { missing: false; truncated: boolean }) | { missing: true };

export async function getMonthlyVisits(month: string): Promise<VisitsResult> {
  const { start, end } = kstMonthRange(month);
  const supabase = getServiceClient();
  const rows: { visitor: string; hour_bucket: string }[] = [];
  let truncated = false;

  for (let from = 0; ; from += PAGE) {
    if (from >= MAX_ROWS) {
      truncated = true;
      break;
    }
    const { data, error } = await supabase
      .from("site_visits")
      .select("visitor, hour_bucket")
      .gte("hour_bucket", start)
      .lt("hour_bucket", end)
      .order("hour_bucket", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") return { missing: true };
      throw new Error(`방문 조회 실패: ${error.message}`);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { ...summarizeVisits(rows, month), missing: false, truncated };
}
