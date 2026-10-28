// 관리자 대시보드 집계용 순수 함수(alias import 없음 — node:test에서 바로 불러온다). 날짜는 한국 시간(KST) 기준으로 센다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' (KST). */
export function kstDayKey(t: Date | string | number): string {
  return new Date(new Date(t).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 오늘까지 최근 n일의 날짜 키(오래된 날부터). */
export function lastNDayKeys(n: number, now: Date | number = new Date()): string[] {
  const base = new Date(now).getTime();
  return Array.from({ length: n }, (_, i) => kstDayKey(base - (n - 1 - i) * DAY_MS));
}

export interface DayPoint {
  day: string;
  values: Record<string, number>;
}

/** 행들을 날짜별로 묶어 계열(series)별 합계를 만든다. days 밖의 행은 버린다. */
export function seriesByDay<T>(
  rows: T[],
  days: string[],
  getTime: (r: T) => string,
  getValues: (r: T) => Record<string, number>
): DayPoint[] {
  const points = new Map<string, DayPoint>(days.map((d) => [d, { day: d, values: {} }]));
  for (const r of rows) {
    const p = points.get(kstDayKey(getTime(r)));
    if (!p) continue;
    for (const [k, v] of Object.entries(getValues(r))) p.values[k] = (p.values[k] ?? 0) + v;
  }
  return days.map((d) => points.get(d)!);
}

export function sumSeries(points: DayPoint[], key: string): number {
  return points.reduce((s, p) => s + (p.values[key] ?? 0), 0);
}

/** 정렬되지 않은 값들의 p 백분위(0~1). 비어 있으면 null. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

export interface CostForecast {
  /** 이번 달(KST) 지금까지 쓴 비용. */
  monthToDate: number;
  /** 최근 7일 하루 평균(기록이 7일보다 짧으면 기록이 있는 날수로 나눈다). */
  dailyAverage: number;
  /** 이번 달 말까지 예상 합계 = 지금까지 + 하루 평균 × 남은 날. */
  projected: number;
  dayOfMonth: number;
  daysInMonth: number;
}

/** dailyCost: 날짜 키별 비용(오래된 날부터, 오늘 포함). 기록이 없는 날은 0으로 넣어 둔다. */
export function forecastMonthCost(dailyCost: { day: string; cost: number }[], now: Date | number = new Date()): CostForecast {
  const today = kstDayKey(now);
  const monthKey = today.slice(0, 7);
  const [y, m, d] = today.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthToDate = dailyCost.filter((p) => p.day.startsWith(monthKey)).reduce((s, p) => s + p.cost, 0);

  const last7 = dailyCost.slice(-7);
  const firstWithCost = last7.findIndex((p) => p.cost > 0);
  const span = firstWithCost === -1 ? 1 : last7.length - firstWithCost;
  const dailyAverage = last7.reduce((s, p) => s + p.cost, 0) / Math.max(1, span);

  const projected = monthToDate + dailyAverage * (daysInMonth - d);
  return { monthToDate, dailyAverage, projected, dayOfMonth: d, daysInMonth };
}

/** IP 일부를 가려서 보여준다(관리자 화면에서도 전체 주소는 쓸 일이 없다). */
export function maskIp(ip: string | null | undefined): string {
  if (!ip) return "알 수 없음";
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + ":…";
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.*` : ip;
}

export interface ConfigCheck {
  id: string;
  label: string;
  ok: boolean;
  /** 어떻게 고치는지(값 자체는 절대 담지 않는다). */
  hint: string;
}

/**
 * 출시 후에도 계속 확인해야 하는 보안 설정 점검. 환경변수의 "있다/없다"와 길이 조건만 보고, 값은 화면에 내보내지 않는다.
 */
export function evaluateSecurityConfig(env: Record<string, string | undefined>): ConfigCheck[] {
  const has = (k: string) => !!env[k]?.trim();
  const password = env.ADMIN_LOGIN_PASSWORD ?? "";
  const sessionSecret = env.ADMIN_SESSION_SECRET ?? "";
  return [
    {
      id: "turnstile",
      label: "비로그인 생성 캡차(Turnstile)",
      ok: has("TURNSTILE_SECRET_KEY") && has("NEXT_PUBLIC_TURNSTILE_SITE_KEY"),
      hint: "캡차 키가 없어 봇 방지가 꺼져 있어요(비로그인 생성은 그대로 열려 있음). TURNSTILE_SECRET_KEY와 NEXT_PUBLIC_TURNSTILE_SITE_KEY를 Vercel 환경변수에 넣으면 켜집니다.",
    },
    {
      id: "admin-password",
      label: "관리자 비밀번호 길이(16자 이상)",
      ok: password.length >= 16,
      hint: "ADMIN_LOGIN_PASSWORD를 20자 이상 랜덤 문자열로 바꾸세요.",
    },
    {
      id: "admin-session-secret",
      label: "관리자 세션 서명 키 분리",
      ok: sessionSecret.length >= 16 && sessionSecret !== password,
      hint: "ADMIN_SESSION_SECRET에 비밀번호와 다른 랜덤 문자열(16자 이상)을 넣으세요.",
    },
    {
      id: "ticket-secret",
      label: "생성 표 서명 키 분리",
      ok: has("GENERATION_TICKET_SECRET"),
      hint: "GENERATION_TICKET_SECRET을 따로 넣으세요. 없으면 서비스 키로 서명합니다.",
    },
    {
      id: "log-prompts",
      label: "학생 입력 로그 꺼짐(LOG_PROMPTS)",
      ok: env.LOG_PROMPTS !== "1",
      hint: "LOG_PROMPTS를 지우거나 0으로 두세요. 켜면 학생 입력이 서버 로그에 남습니다.",
    },
    {
      id: "production",
      label: "프로덕션 모드로 실행 중",
      ok: env.NODE_ENV === "production",
      hint: "배포 환경에서 NODE_ENV가 production이어야 캡차 필수·보안 헤더가 켜집니다.",
    },
  ];
}
