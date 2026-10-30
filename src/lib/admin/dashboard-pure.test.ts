import { test } from "node:test";
import assert from "node:assert/strict";
import { kstDayKey, lastNDayKeys, seriesByDay, sumSeries, percentile, forecastMonthCost, maskIp, evaluateSecurityConfig, isValidDayKey, kstDayRange, hourlyByDay } from "./dashboard-pure.ts";

test("날짜 키는 한국 시간 기준: UTC 15시는 이미 다음 날", () => {
  assert.equal(kstDayKey("2026-10-24T14:59:59Z"), "2026-10-24");
  assert.equal(kstDayKey("2026-10-24T15:00:00Z"), "2026-10-25");
});

test("최근 n일 키는 오래된 날부터 오늘까지", () => {
  assert.deepEqual(lastNDayKeys(3, new Date("2026-10-25T03:00:00Z")), ["2026-10-23", "2026-10-24", "2026-10-25"]);
});

test("날짜별 계열 합계: 범위 밖 행은 버리고 빈 날은 0", () => {
  const days = lastNDayKeys(3, new Date("2026-10-25T03:00:00Z"));
  const rows = [
    { at: "2026-10-25T01:00:00Z", kind: "login" },
    { at: "2026-10-25T02:00:00Z", kind: "guest" },
    { at: "2026-10-23T01:00:00Z", kind: "login" },
    { at: "2026-09-01T01:00:00Z", kind: "login" },
  ];
  const s = seriesByDay(rows, days, (r) => r.at, (r) => ({ [r.kind]: 1 }));
  assert.deepEqual(s.map((p) => p.values), [{ login: 1 }, {}, { login: 1, guest: 1 }]);
  assert.equal(sumSeries(s, "login"), 2);
  assert.equal(sumSeries(s, "none"), 0);
});

test("백분위", () => {
  assert.equal(percentile([], 0.95), null);
  assert.equal(percentile([5], 0.95), 5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5), 5);
  assert.equal(percentile([10, 1, 9, 2, 8, 3, 7, 4, 6, 5], 0.95), 10);
});

test("월말 비용 예측: 지금까지 + 최근 7일 평균 × 남은 날", () => {
  const now = new Date("2026-10-25T03:00:00Z"); // KST 10/25, 10월은 31일 → 남은 6일
  const days = lastNDayKeys(30, now);
  const daily = days.map((day, i) => ({ day, cost: i >= 23 ? 2 : 0 })); // 최근 7일 매일 $2
  const f = forecastMonthCost(daily, now);
  assert.equal(f.dayOfMonth, 25);
  assert.equal(f.daysInMonth, 31);
  assert.equal(f.monthToDate, 14);
  assert.equal(f.dailyAverage, 2);
  assert.equal(f.projected, 14 + 2 * 6);
});

test("월말 비용 예측: 기록이 짧으면 기록 있는 날수로 나눈다, 기록이 없으면 0", () => {
  const now = new Date("2026-10-25T03:00:00Z");
  const days = lastNDayKeys(30, now);
  const young = days.map((day, i) => ({ day, cost: i >= 28 ? 3 : 0 })); // 이틀치만
  assert.equal(forecastMonthCost(young, now).dailyAverage, 3);
  const none = forecastMonthCost(days.map((day) => ({ day, cost: 0 })), now);
  assert.equal(none.projected, 0);
});

test("IP 가리기", () => {
  assert.equal(maskIp("203.0.113.7"), "203.0.113.*");
  assert.equal(maskIp("2001:db8:85a3:0:0:8a2e:370:7334"), "2001:db8:85a3:…");
  assert.equal(maskIp(null), "알 수 없음");
});

test("보안 설정 점검: 값은 담지 않고 조건만 본다", () => {
  const good = evaluateSecurityConfig({
    TURNSTILE_SECRET_KEY: "a", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "b",
    ADMIN_LOGIN_PASSWORD: "x".repeat(20), ADMIN_SESSION_SECRET: "y".repeat(20), GENERATION_TICKET_SECRET: "z", NODE_ENV: "production",
  });
  assert.equal(good.every((c) => c.ok), true);
  const bad = evaluateSecurityConfig({ ADMIN_LOGIN_PASSWORD: "short", ADMIN_SESSION_SECRET: "short", LOG_PROMPTS: "1", NODE_ENV: "development" });
  assert.deepEqual(bad.filter((c) => !c.ok).map((c) => c.id).sort(), ["admin-password", "admin-session-secret", "log-prompts", "production", "ticket-secret", "turnstile"]);
  // 세션 키가 비밀번호와 같으면 분리된 게 아니다.
  const same = "q".repeat(20);
  assert.equal(evaluateSecurityConfig({ ADMIN_LOGIN_PASSWORD: same, ADMIN_SESSION_SECRET: same }).find((c) => c.id === "admin-session-secret")?.ok, false);
  // 어느 점검에도 환경변수 값이 새어 나가지 않는다.
  assert.equal(JSON.stringify(good).includes("xxxx"), false);
});

test("달력에 있는 날짜만 통과", () => {
  for (const ok of ["2026-10-30", "2024-02-29"]) assert.equal(isValidDayKey(ok), true);
  for (const bad of ["2026-02-30", "2026-13-01", "2026-1-1", "20261030", "", null, undefined, 20261030, "2026-10-30T00:00"]) assert.equal(isValidDayKey(bad), false);
});

test("한국 시간 하루의 UTC 범위", () => {
  assert.deepEqual(kstDayRange("2026-10-30"), { start: "2026-10-29T15:00:00.000Z", end: "2026-10-30T15:00:00.000Z" });
});

test("시간대별 집계: 한국 시간 기준으로 0~23시에 넣고 다른 날은 버린다", () => {
  const rows = [
    { at: "2026-10-29T15:00:00Z", k: "login" }, // KST 10/30 00:00 → 0시
    { at: "2026-10-30T03:59:59Z", k: "guest" }, // KST 12:59 → 12시
    { at: "2026-10-30T04:00:00Z", k: "login" }, // KST 13:00 → 13시
    { at: "2026-10-30T04:30:00Z", k: "login" }, // 13시
    { at: "2026-10-30T14:59:59Z", k: "regen" }, // KST 23:59 → 23시
    { at: "2026-10-30T15:00:00Z", k: "login" }, // KST 10/31 00:00 → 다른 날, 버림
    { at: "2026-10-29T14:59:59Z", k: "login" }, // KST 10/29 23:59 → 다른 날, 버림
  ];
  const h = hourlyByDay(rows, "2026-10-30", (r) => r.at, (r) => ({ [r.k]: 1 }));
  assert.equal(h.length, 24);
  assert.deepEqual(h.map((p) => p.day).slice(0, 3), ["00", "01", "02"]);
  assert.deepEqual(h[0].values, { login: 1 });
  assert.deepEqual(h[12].values, { guest: 1 });
  assert.deepEqual(h[13].values, { login: 2 });
  assert.deepEqual(h[23].values, { regen: 1 });
  assert.equal(h.reduce((s, p) => s + Object.values(p.values).reduce((a, b) => a + b, 0), 0), 5);
  // 잘못된 시각은 버린다
  assert.equal(hourlyByDay([{ at: "not-a-date", k: "login" }], "2026-10-30", (r) => r.at, (r) => ({ [r.k]: 1 })).every((p) => Object.keys(p.values).length === 0), true);
});
