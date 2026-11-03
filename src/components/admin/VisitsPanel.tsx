"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import StackedBars from "./StackedBars";
import type { VisitSummary } from "@/lib/admin/visits-pure";

// "웹사이트 방문" 패널: 달을 고르면 그 달에 몇 시에 몇 명, 며칠에 몇 명이 왔는지 보여준다. 달이 바뀔 때만 관리자 API를 부른다.
type Data = (VisitSummary & { missing: false; truncated: boolean }) | { missing: true };
const SERIES = [{ key: "visitors", label: "방문자", className: "bg-foreground" }];

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function VisitsPanel({ thisMonth, minMonth }: { thisMonth: string; minMonth: string }) {
  const [month, setMonth] = useState(thisMonth);
  const [result, setResult] = useState<{ month: string; data?: Data; error?: string } | null>(null);
  const data = result?.month === month ? (result.data ?? null) : null;
  const error = result?.month === month ? (result.error ?? null) : null;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/visits?month=${month}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((body as { error?: string }).error ?? "불러오지 못했어요.");
        setResult({ month, data: body as Data });
      })
      .catch((err) => {
        if (err.name !== "AbortError") setResult({ month, error: err instanceof Error ? err.message : "불러오지 못했어요." });
      });
    return () => controller.abort();
  }, [month]);

  const pick = (next: string) => {
    if (next >= minMonth && next <= thisMonth) setMonth(next);
  };
  const [y, m] = month.split("-").map(Number);

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          웹사이트 방문 <span className="font-normal text-muted">({y}년 {m}월)</span>
        </h3>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => pick(shiftMonth(month, -1))} disabled={month <= minMonth} aria-label="전달" className="grid size-7 place-items-center rounded-lg border border-border text-muted hover:bg-raised disabled:opacity-30">
            <ChevronLeft size={14} />
          </button>
          <input type="month" value={month} min={minMonth} max={thisMonth} onChange={(e) => e.target.value && pick(e.target.value)} aria-label="달 선택" className="h-7 rounded-lg border border-border bg-background px-2 text-xs tabular-nums" />
          <button type="button" onClick={() => pick(shiftMonth(month, 1))} disabled={month >= thisMonth} aria-label="다음 달" className="grid size-7 place-items-center rounded-lg border border-border text-muted hover:bg-raised disabled:opacity-30">
            <ChevronRight size={14} />
          </button>
          {month !== thisMonth && (
            <button type="button" onClick={() => pick(thisMonth)} className="ml-1 h-7 rounded-lg border border-border px-2 text-xs text-muted hover:bg-raised">
              이번 달
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
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs text-muted">시간대별 방문자 (그 달 합계)</p>
            <StackedBars data={data.hours} series={SERIES} labelOf={(h) => `${Number(h)}시`} unit="시간대별" />
          </div>
          <div>
            <p className="mb-2 text-xs text-muted">날짜별 방문자</p>
            <StackedBars data={data.days} series={SERIES} unit="일별" />
          </div>
          <p className="text-xs text-muted tabular-nums md:col-span-2">
            {data.total === 0 ? "이 달은 방문 기록이 없어요." : `방문자 ${data.total}명 · 가장 붐비는 시간 ${data.peak!.hour}시 (${data.peak!.count}명)`}
            {data.truncated && " · 기록이 많아 일부만 집계했어요."}
            <span className="text-faint"> · 날짜별로 한 사람을 한 번 센 합계예요(봇·관리자 본인 제외).</span>
          </p>
        </div>
      )}
    </div>
  );
}
