import { getServiceClient } from "@/lib/supabase/service-client";
import { ADMIN_ACCOUNT_EMAIL } from "./session";
import { getLockoutConfig } from "./lockout";
import {
  evaluateSecurityConfig,
  forecastMonthCost,
  kstDayKey,
  lastNDayKeys,
  maskIp,
  percentile,
  seriesByDay,
  sumSeries,
  type ConfigCheck,
  type CostForecast,
  type DayPoint,
} from "./dashboard-pure";

// 관리자 대시보드 데이터(서버 전용). 개인 식별 정보(이메일·사용자 id·IP 전체)는 내보내지 않는다 — 집계와 가린 IP만.
// 표가 아직 없으면(마이그레이션 0016·0018 미적용) 그 부분만 비워 두고 나머지는 그대로 보여준다.

const DAYS = 30;
const PAGE = 1000;
const MAX_ROWS = 20_000;

/** 생성 1건당 평균 비용(USD) — 실측 기록(ai_usage_log)이 없을 때의 추정치. 2026-10-24 30회 점검 평균 $0.049(분석 포함). */
const FALLBACK_COST_PER_GENERATION = Number(process.env.AI_COST_PER_GENERATION_USD ?? 0.049);

interface Paged<T> {
  rows: T[];
  truncated: boolean;
  /** 표가 아직 없다. */
  missing: boolean;
}

function isMissingTable(err: { code?: string } | null): boolean {
  return err?.code === "42P01" || err?.code === "PGRST205";
}

/** PostgREST는 한 번에 1000행까지만 주므로 나눠서 읽는다(최신부터, 상한을 넘으면 오래된 쪽을 버린다). */
async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { code?: string; message: string } | null }>
): Promise<Paged<T>> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) {
      if (isMissingTable(error)) return { rows: [], truncated: false, missing: true };
      throw new Error(`대시보드 조회 실패: ${error.message}`);
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return { rows, truncated: false, missing: false };
  }
  return { rows, truncated: true, missing: false };
}

async function listAllUsers(): Promise<{ created_at: string; last_sign_in_at: string | null }[]> {
  const out: { created_at: string; last_sign_in_at: string | null }[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await getServiceClient().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`사용자 조회 실패: ${error.message}`);
    for (const u of data.users) {
      if (u.email === ADMIN_ACCOUNT_EMAIL) continue; // 관리자 예약 계정은 실사용자가 아니다
      out.push({ created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null });
    }
    if (data.users.length < 1000) break;
  }
  return out;
}

export interface RouteRow {
  route: string;
  requests: number;
  errors: number;
  limited: number;
  failedCalls: number;
  costUsd: number;
  avgCostUsd: number;
  avgSeconds: number | null;
  p95Seconds: number | null;
}

export interface AiSection {
  /** measured: ai_usage_log 실측 / estimated: 기록이 없어 생성 횟수 × 평균 단가로 추정 */
  source: "measured" | "estimated";
  /** 표(0018)가 아직 없다. */
  tableMissing: boolean;
  days: DayPoint[]; // values: requests, errors, limited, cost
  totals30: { requests: number; errors: number; limited: number; cost: number };
  today: { requests: number; errors: number; cost: number };
  forecast: CostForecast;
  budgetUsd: number | null;
  byRoute: RouteRow[];
  recentErrors: { at: string; route: string; status: number; seconds: number }[];
  truncated: boolean;
}

export interface SecuritySection {
  attempts: { at: string; ip: string; success: boolean }[];
  failures24h: number;
  failures7d: number;
  failingIps7d: number;
  lockedIpsNow: number;
  globalFailuresInWindow: number;
  lockout: ReturnType<typeof getLockoutConfig>;
  lastSuccessAt: string | null;
  throttle: { today: number; soft: number; hard: number };
  limitedToday: number | null;
  config: ConfigCheck[];
}

export interface DashboardData {
  generatedAt: string;
  users: { total: number; signups7d: number; signups30d: number; active7d: number; active30d: number; signupDays: DayPoint[] };
  generations: { days: DayPoint[]; truncated: boolean }; // values: login, guest, regen
  study: { days: DayPoint[]; byKind: { kind: string; count: number }[]; total30: number } | null;
  ai: AiSection;
  security: SecuritySection;
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

export async function getDashboardData(now = new Date()): Promise<DashboardData> {
  const supabase = getServiceClient();
  const days = lastNDayKeys(DAYS, now);
  const since = new Date(now.getTime() - (DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
  const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [users, events, studyRows, aiRows, attempts] = await Promise.all([
    listAllUsers(),
    fetchAll<{ created_at: string; event_type: string; user_id: string | null }>((a, b) =>
      supabase.from("usage_events").select("created_at, event_type, user_id").gte("created_at", since).order("created_at", { ascending: false }).range(a, b)
    ),
    fetchAll<{ created_at: string; kind: string }>((a, b) =>
      supabase.from("study_usage_events").select("created_at, kind").gte("created_at", since).order("created_at", { ascending: false }).range(a, b)
    ),
    fetchAll<{ created_at: string; route: string; status: number; ok: boolean; failed_calls: number; cost_usd: number | string; wall_ms: number }>((a, b) =>
      supabase.from("ai_usage_log").select("created_at, route, status, ok, failed_calls, cost_usd, wall_ms").gte("created_at", since).order("created_at", { ascending: false }).range(a, b)
    ),
    supabase.from("admin_login_attempts").select("created_at, ip, success").gte("created_at", since7).order("created_at", { ascending: false }).limit(1000),
  ]);
  if (attempts.error) throw new Error(`로그인 기록 조회 실패: ${attempts.error.message}`);

  // ── 사용자 ──
  const t7 = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const t30 = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const usersSection = {
    total: users.length,
    signups7d: users.filter((u) => new Date(u.created_at).getTime() >= t7).length,
    signups30d: users.filter((u) => new Date(u.created_at).getTime() >= t30).length,
    active7d: users.filter((u) => u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() >= t7).length,
    active30d: users.filter((u) => u.last_sign_in_at && new Date(u.last_sign_in_at).getTime() >= t30).length,
    signupDays: seriesByDay(users, days, (u) => u.created_at, () => ({ signups: 1 })),
  };

  // ── 생성 횟수 ──
  const genDays = seriesByDay(events.rows, days, (r) => r.created_at, (r): Record<string, number> =>
    r.event_type === "regenerate" ? { regen: 1 } : r.user_id ? { login: 1 } : { guest: 1 }
  );

  // ── 공부 도구 ──
  let study: DashboardData["study"] = null;
  if (!studyRows.missing) {
    const byKind = new Map<string, number>();
    for (const r of studyRows.rows) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
    study = {
      days: seriesByDay(studyRows.rows, days, (r) => r.created_at, () => ({ uses: 1 })),
      byKind: [...byKind.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
      total30: studyRows.rows.length,
    };
  }

  // ── AI 사용량·비용·오류 ──
  const measured = !aiRows.missing && aiRows.rows.length > 0;
  const aiDays: DayPoint[] = measured
    ? seriesByDay(aiRows.rows, days, (r) => r.created_at, (r) => ({
        requests: 1,
        errors: r.ok ? 0 : 1,
        limited: r.status === 429 ? 1 : 0,
        cost: num(r.cost_usd),
      }))
    : genDays.map((p) => {
        const gens = (p.values.login ?? 0) + (p.values.guest ?? 0) + (p.values.regen ?? 0);
        return { day: p.day, values: { requests: gens, errors: 0, limited: 0, cost: gens * FALLBACK_COST_PER_GENERATION } };
      });

  const routeMap = new Map<string, { requests: number; errors: number; limited: number; failedCalls: number; cost: number; ms: number[] }>();
  if (measured) {
    for (const r of aiRows.rows) {
      const m = routeMap.get(r.route) ?? { requests: 0, errors: 0, limited: 0, failedCalls: 0, cost: 0, ms: [] };
      m.requests++;
      if (!r.ok) m.errors++;
      if (r.status === 429) m.limited++;
      m.failedCalls += r.failed_calls ?? 0;
      m.cost += num(r.cost_usd);
      if (r.ok && r.status < 400 && r.wall_ms > 0) m.ms.push(r.wall_ms);
      routeMap.set(r.route, m);
    }
  }
  const byRoute: RouteRow[] = [...routeMap.entries()]
    .map(([route, m]) => ({
      route,
      requests: m.requests,
      errors: m.errors,
      limited: m.limited,
      failedCalls: m.failedCalls,
      costUsd: m.cost,
      avgCostUsd: m.requests > 0 ? m.cost / m.requests : 0,
      avgSeconds: m.ms.length ? m.ms.reduce((s, v) => s + v, 0) / m.ms.length / 1000 : null,
      p95Seconds: percentile(m.ms, 0.95) === null ? null : percentile(m.ms, 0.95)! / 1000,
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const todayKey = kstDayKey(now);
  const todayPoint = aiDays.find((p) => p.day === todayKey);
  const budget = Number(process.env.AI_MONTHLY_BUDGET_USD);
  const ai: AiSection = {
    source: measured ? "measured" : "estimated",
    tableMissing: aiRows.missing,
    days: aiDays,
    totals30: {
      requests: sumSeries(aiDays, "requests"),
      errors: sumSeries(aiDays, "errors"),
      limited: sumSeries(aiDays, "limited"),
      cost: sumSeries(aiDays, "cost"),
    },
    today: { requests: todayPoint?.values.requests ?? 0, errors: todayPoint?.values.errors ?? 0, cost: todayPoint?.values.cost ?? 0 },
    forecast: forecastMonthCost(aiDays.map((p) => ({ day: p.day, cost: p.values.cost ?? 0 })), now),
    budgetUsd: Number.isFinite(budget) && budget > 0 ? budget : null,
    byRoute,
    recentErrors: measured
      ? aiRows.rows
          .filter((r) => !r.ok)
          .slice(0, 15)
          .map((r) => ({ at: r.created_at, route: r.route, status: r.status, seconds: Math.round(r.wall_ms / 100) / 10 }))
      : [],
    truncated: aiRows.truncated,
  };

  // ── 보안 ──
  const lockout = getLockoutConfig();
  const attemptRows = (attempts.data ?? []) as { created_at: string; ip: string | null; success: boolean }[];
  const windowStart = now.getTime() - lockout.windowMinutes * 60 * 1000;
  const dayAgo = now.getTime() - 24 * 60 * 60 * 1000;
  const failures = attemptRows.filter((a) => !a.success);
  const inWindow = failures.filter((a) => new Date(a.created_at).getTime() >= windowStart);
  const perIp = new Map<string, number>();
  for (const a of inWindow) perIp.set(a.ip ?? "?", (perIp.get(a.ip ?? "?") ?? 0) + 1);

  const throttleStart = new Date(now);
  throttleStart.setHours(0, 0, 0, 0); // throttle.ts의 "오늘"과 같은 기준
  const soft = Number(process.env.THROTTLE_GLOBAL_SOFT_LIMIT ?? 500);
  const security: SecuritySection = {
    attempts: attemptRows.slice(0, 12).map((a) => ({ at: a.created_at, ip: maskIp(a.ip), success: a.success })),
    failures24h: failures.filter((a) => new Date(a.created_at).getTime() >= dayAgo).length,
    failures7d: failures.length,
    failingIps7d: new Set(failures.map((a) => a.ip ?? "?")).size,
    lockedIpsNow: [...perIp.values()].filter((n) => n >= lockout.maxFailuresPerIp).length,
    globalFailuresInWindow: inWindow.length,
    lockout,
    lastSuccessAt: attemptRows.find((a) => a.success)?.created_at ?? null,
    throttle: {
      today: events.rows.filter((r) => new Date(r.created_at).getTime() >= throttleStart.getTime()).length,
      soft,
      hard: soft * Number(process.env.THROTTLE_GLOBAL_HARD_MULTIPLIER ?? 5),
    },
    limitedToday: measured ? aiRows.rows.filter((r) => r.status === 429 && new Date(r.created_at).getTime() >= throttleStart.getTime()).length : null,
    config: evaluateSecurityConfig(process.env),
  };

  return {
    generatedAt: now.toISOString(),
    users: usersSection,
    generations: { days: genDays, truncated: events.truncated },
    study,
    ai,
    security,
  };
}
