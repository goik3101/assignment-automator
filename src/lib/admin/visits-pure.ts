import { createHmac } from "crypto";
import { kstDayKey, type DayPoint } from "./dashboard-pure.ts";

// 웹사이트 방문 집계용 순수 함수(alias import 없음). 시각은 한국 시간(KST) 기준.
const HOUR_MS = 60 * 60 * 1000;
const KST_MS = 9 * HOUR_MS;

const BOT_UA = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|monitor|uptime|curl|wget|python|node-fetch|axios|go-http|java\/|vercel/i;

/** 사람이 연 브라우저로 보이는가(빈 UA·검색/미리보기/모니터링 봇 제외). */
export function isLikelyHuman(userAgent: string | null | undefined): boolean {
  return !!userAgent && userAgent.length >= 10 && !BOT_UA.test(userAgent);
}

/** 한국 날짜가 바뀌면 값이 달라지는 익명 방문자 키(IP·UA는 저장하지 않는다). */
export function visitorKey(ip: string, userAgent: string, now: number, secret: string): string {
  return createHmac("sha256", secret).update(`${ip}|${userAgent}|${kstDayKey(now)}`).digest("hex").slice(0, 32);
}

/** 방문 시각을 정시(UTC)로 내린 ISO 문자열 — 한국은 정시 단위 차이라 한국 시간 정시와도 같다. */
export function hourBucketIso(now: number): string {
  return new Date(Math.floor(now / HOUR_MS) * HOUR_MS).toISOString();
}

export function isValidMonthKey(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function kstMonthKey(t: Date | string | number): string {
  return kstDayKey(t).slice(0, 7);
}

/** 한국 시간 한 달의 UTC 범위(시작 포함, 끝 미포함). */
export function kstMonthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1) - KST_MS).toISOString(), end: new Date(Date.UTC(y, m, 1) - KST_MS).toISOString() };
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export interface VisitSummary {
  month: string;
  /** "00"~"23"시별 방문자 수(그 달 전체 합). */
  hours: DayPoint[];
  /** 날짜별 방문자 수(하루 안에서는 중복 제거). */
  days: DayPoint[];
  /** 그 달 방문자 합계 = 날짜별 방문자의 합(날짜를 넘어서는 같은 사람은 구분하지 못한다). */
  total: number;
  peak: { hour: number; count: number } | null;
}

/** rows: 한 줄이 "방문자 1명의 한 시간". 같은 날 같은 방문자는 하루 방문자 1명으로 센다. */
export function summarizeVisits(rows: { visitor: string; hour_bucket: string }[], month: string): VisitSummary {
  const hours = Array.from({ length: 24 }, (_, h): DayPoint => ({ day: String(h).padStart(2, "0"), values: {} }));
  const dayKeys = Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const perDay = new Map<string, Set<string>>(dayKeys.map((d) => [d, new Set()]));

  for (const r of rows) {
    const t = new Date(r.hour_bucket).getTime();
    if (!Number.isFinite(t)) continue;
    const set = perDay.get(kstDayKey(t));
    if (!set) continue; // 이 달이 아니다
    set.add(r.visitor);
    const h = new Date(t + KST_MS).getUTCHours();
    hours[h].values.visitors = (hours[h].values.visitors ?? 0) + 1;
  }

  const days = dayKeys.map((d): DayPoint => ({ day: d, values: { visitors: perDay.get(d)!.size } }));
  const hourTotals = hours.map((p) => p.values.visitors ?? 0);
  const peakCount = Math.max(...hourTotals, 0);
  return {
    month,
    hours,
    days,
    total: days.reduce((s, p) => s + (p.values.visitors ?? 0), 0),
    peak: peakCount > 0 ? { hour: hourTotals.indexOf(peakCount), count: peakCount } : null,
  };
}
