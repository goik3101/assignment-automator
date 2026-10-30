"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import StackedBars from "./StackedBars";
import type { HourlyGenerations as HourlyData } from "@/lib/admin/hourly";

// "시간대별 생성" 패널: 날짜(월/일)를 고르면 그날 0~23시에 생성이 몇 건 있었는지 보여준다. 날짜가 바뀔 때만 관리자 API를 부른다.
const SERIES = [
  { key: "login", label: "로그인", className: "bg-foreground" },
  { key: "guest", label: "비로그인", className: "bg-faint" },
  { key: "regen", label: "재생성", className: "bg-muted" },
];

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default function HourlyGenerations({ today, minDay }: { today: string; minDay: string }) {
  const [day, setDay] = useState(today);
  // 결과에 어느 날짜 것인지 함께 담아 두면, 날짜를 바꾼 직후에는 아직 도착하지 않은 것으로 보여 로딩 표시가 저절로 된다(effect 안에서 상태를 비울 필요 없음).
  const [result, setResult] = useState<{ day: string; data?: HourlyData; error?: string } | null>(null);
  const data = result?.day === day ? (result.data ?? null) : null;
  const error = result?.day === day ? (result.error ?? null) : null;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/hourly?date=${day}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { error?: string }).error ?? "불러오지 못했어요.");
        setResult({ day, data: body as HourlyData });
      })
      .catch((err) => {
        if (err.name !== "AbortError") setResult({ day, error: err instanceof Error ? err.message : "불러오지 못했어요." });
      });
    return () => controller.abort();
  }, [day]);

  const [, month, date] = day.split("-").map(Number);
  const pick = (next: string) => {
    if (next && next >= minDay && next <= today) setDay(next);
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          시간대별 생성 <span className="font-normal text-muted">({month}월 {date}일)</span>
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => pick(shiftDay(day, -1))}
            disabled={day <= minDay}
            aria-label="전날"
            className="grid size-7 place-items-center rounded-lg border border-border text-muted hover:bg-raised disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
          <input
            type="date"
            value={day}
            min={minDay}
            max={today}
            onChange={(e) => pick(e.target.value)}
            aria-label="날짜 선택"
            className="h-7 rounded-lg border border-border bg-background px-2 text-xs tabular-nums"
          />
          <button
            type="button"
            onClick={() => pick(shiftDay(day, 1))}
            disabled={day >= today}
            aria-label="다음 날"
            className="grid size-7 place-items-center rounded-lg border border-border text-muted hover:bg-raised disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
          {day !== today && (
            <button type="button" onClick={() => pick(today)} className="ml-1 h-7 rounded-lg border border-border px-2 text-xs text-muted hover:bg-raised">
              오늘
            </button>
          )}
        </div>
      </div>

      {error ? (
        <p className="py-10 text-center text-sm text-danger">{error}</p>
      ) : !data ? (
        <div className="h-[112px] animate-pulse rounded-lg bg-raised" aria-busy="true" />
      ) : (
        <>
          <StackedBars data={data.hours} series={SERIES} labelOf={(h) => `${Number(h)}시`} unit="시간대별" />
          <p className="mt-3 text-xs text-muted tabular-nums">
            {data.total === 0
              ? "이 날은 생성 기록이 없어요."
              : `총 ${data.total}건 · 가장 많은 시간 ${data.peak!.hour}시 (${data.peak!.count}건)`}
            {data.truncated && " · 기록이 많아 일부만 집계했어요."}
          </p>
        </>
      )}
    </div>
  );
}
