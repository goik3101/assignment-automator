import { test } from "node:test";
import assert from "node:assert/strict";
import { isLikelyHuman, visitorKey, hourBucketIso, isValidMonthKey, kstMonthRange, summarizeVisits } from "./visits-pure.ts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

test("봇·빈 UA는 방문으로 세지 않는다", () => {
  assert.equal(isLikelyHuman(UA), true);
  for (const bad of ["", null, undefined, "Googlebot/2.1", "curl/8.0", "python-requests/2.31", "Mozilla/5.0 (compatible; bingbot/2.0)", "short"]) assert.equal(isLikelyHuman(bad as string), false);
});

test("방문자 키: 같은 날 같은 사람은 같고, 날이 바뀌면 달라지며 IP·UA가 드러나지 않는다", () => {
  const d1 = Date.parse("2026-11-04T01:00:00Z");
  const a = visitorKey("1.2.3.4", UA, d1, "s");
  assert.equal(a, visitorKey("1.2.3.4", UA, d1 + 3600_000, "s"));
  assert.notEqual(a, visitorKey("1.2.3.4", UA, d1 + 24 * 3600_000, "s"));
  assert.notEqual(a, visitorKey("1.2.3.5", UA, d1, "s"));
  assert.equal(a.length, 32);
  assert.equal(a.includes("1.2.3.4"), false);
});

test("정시 버킷과 월 범위(KST)", () => {
  assert.equal(hourBucketIso(Date.parse("2026-11-04T05:42:11Z")), "2026-11-04T05:00:00.000Z");
  assert.equal(isValidMonthKey("2026-11"), true);
  for (const bad of ["2026-13", "2026-1", "202611", "", null]) assert.equal(isValidMonthKey(bad), false);
  assert.deepEqual(kstMonthRange("2026-11"), { start: "2026-10-31T15:00:00.000Z", end: "2026-11-30T15:00:00.000Z" });
});

test("월 집계: 시간대별 합·날짜별 중복 제거·다른 달 제외", () => {
  const rows = [
    { visitor: "a", hour_bucket: "2026-10-31T15:00:00Z" }, // KST 11/01 00시
    { visitor: "a", hour_bucket: "2026-11-01T03:00:00Z" }, // KST 11/01 12시 — 같은 날 같은 사람
    { visitor: "b", hour_bucket: "2026-11-01T03:00:00Z" }, // KST 11/01 12시
    { visitor: "c", hour_bucket: "2026-11-02T03:00:00Z" }, // KST 11/02 12시
    { visitor: "d", hour_bucket: "2026-11-30T15:00:00Z" }, // KST 12/01 — 다른 달
    { visitor: "e", hour_bucket: "bad" },
  ];
  const s = summarizeVisits(rows, "2026-11");
  assert.equal(s.hours.length, 24);
  assert.equal(s.days.length, 30);
  assert.equal(s.hours[0].values.visitors, 1);
  assert.equal(s.hours[12].values.visitors, 3);
  assert.equal(s.days[0].values.visitors, 2); // 11/01: a, b
  assert.equal(s.days[1].values.visitors, 1);
  assert.equal(s.total, 3);
  assert.deepEqual(s.peak, { hour: 12, count: 3 });
  assert.equal(summarizeVisits([], "2026-11").peak, null);
});
