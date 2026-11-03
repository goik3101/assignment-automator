"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import StackedBars from "./StackedBars";
import type { DayVisits } from "@/lib/admin/visits-pure";

// "웹사이트 방문" 패널: 월·일을 고르면 그날 0~23시에 몇 명이 왔는지 보여준다. 날짜가 바뀔 때만 관리자 API를 부른다.
type Data = (DayVisits & { missing: false }) | { missing: true };
const SERIES = [{ key: "visitors", label: "방문자", className: "bg-foreground" }];

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default function VisitsPanel({ today, minDay }: { today: string; minDay: string }) {
  const [day, setDay] = useState(today);
  const [result, setResult] = useState<{ day: string; data?: Data; error?: string } | null>(null);
  const data = result?.day === day ? (result.data ?? null) : null;
  const error = result?.day === day ? (result.error ?? null) : null;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/visits?date=${day}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { error?: string }).error ?? "불러오지 못했어요.");
        setResult({ day, data: body as Data });
      })
      .catch((err) => {
        if (err.name !== "AbortError") setResult({ day, error: err instanceof Error ? err.message : "불러오지 못했어요." });
      });
    return () => controller.abort();
  }, [day]);

  const pick = (next: string) => {
    if (next && next >= minDay && next <= today) setDay(next);
  };
  const [, month, date] = day.split("-").map(Number);
  const btn = "grid size-7 place-items-center rounded-lg border border-border text-muted hover:bg-raised disabled:opacity-30";

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          시간대별 방문자 <span className="font-normal text-muted">({month}월 {date}일)</span>
        </h3>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => pick(shiftDay(day, -1))} disabled={day <= minDay} aria-label="전날" className={btn}>
            <ChevronLeft size={14} />
          </button>
          <input type="date" value={day} min={minDay} max={today} onChange={(e) => pick(e.target.value)} aria-label="날짜 선택" className="h-7 rounded-lg border border-border bg-background px-2 text-xs tabular-nums" />
          <button type="button" onClick={() => pick(shiftDay(day, 1))} disabled={day >= today} aria-label="다음 날" className={btn}>
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
      ) : data.missing ? (
        <p className="rounded-xl border border-border bg-raised px-4 py-3 text-xs leading-relaxed text-muted">방문 기록 표(마이그레이션 0020)가 아직 적용되지 않았어요. 적용하면 그 시점부터 방문이 쌓여요.</p>
      ) : (
        <>
          <StackedBars data={data.hours} series={SERIES} labelOf={(h) => `${Number(h)}시`} unit="시간대별" />
          <p className="mt-3 text-xs text-muted tabular-nums">
            {data.total === 0 ? "이 날은 방문 기록이 없어요." : `방문자 ${data.total}명 · 가장 붐빈 시간 ${data.peak!.hour}시 (${data.peak!.count}명)`}
            <span className="text-faint"> · 봇·관리자 본인 제외, 같은 사람은 하루 한 번만 세요.</span>
          </p>
        </>
      )}
    </div>
  );
}
