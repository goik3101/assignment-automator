import type { DayPoint } from "@/lib/admin/dashboard-pure";

// 의존성 없이 그리는 날짜별 막대 그래프(서버 컴포넌트). 계열을 위로 쌓고, 막대에 마우스를 올리면 그날 수치가 title로 보인다.
export interface BarSeries {
  key: string;
  label: string;
  /** Tailwind 배경색 클래스(디자인 토큰만 쓴다). */
  className: string;
}

export default function StackedBars({
  data,
  series,
  format = (n) => String(Math.round(n)),
  height = 112,
  labelOf = (key) => key.slice(5).replace("-", "/"),
  unit = "일별",
}: {
  data: DayPoint[];
  series: BarSeries[];
  format?: (n: number) => string;
  height?: number;
  /** 막대의 키(날짜 또는 시각)를 눈금·말풍선에 보일 글자로 바꾼다. 기본은 "MM/DD". */
  labelOf?: (key: string) => string;
  /** 접근성 설명에 쓰는 구분("일별", "시간대별"). */
  unit?: string;
}) {
  const totals = data.map((p) => series.reduce((s, x) => s + (p.values[x.key] ?? 0), 0));
  const max = Math.max(...totals, 0);
  const label = labelOf;

  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }} role="img" aria-label={series.map((s) => s.label).join(", ") + ` ${unit} 그래프`}>
        {data.map((p, i) => {
          const parts = series.map((s) => ({ s, v: p.values[s.key] ?? 0 })).filter((x) => x.v > 0);
          const tip = `${label(p.day)} — ` + (parts.length ? parts.map((x) => `${x.s.label} ${format(x.v)}`).join(", ") : "기록 없음");
          return (
            <div key={p.day} title={tip} className="flex h-full flex-1 flex-col justify-end">
              {max > 0 && totals[i] > 0 ? (
                <div className="flex w-full flex-col-reverse overflow-hidden rounded-[2px]" style={{ height: `${Math.max(4, (totals[i] / max) * 100)}%` }}>
                  {parts.map((x) => (
                    <div key={x.s.key} className={x.s.className} style={{ height: `${(x.v / totals[i]) * 100}%` }} />
                  ))}
                </div>
              ) : (
                <div className="h-[2px] w-full rounded-full bg-border" />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-faint tabular-nums">
        <span>{data[0] ? label(data[0].day) : ""}</span>
        <span>{data[Math.floor(data.length / 2)] ? label(data[Math.floor(data.length / 2)].day) : ""}</span>
        <span>{data.length ? label(data[data.length - 1].day) : ""}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={`inline-block size-2 rounded-[2px] ${s.className}`} />
            {s.label}
          </span>
        ))}
        {max > 0 && <span className="ml-auto text-faint">일 최대 {format(max)}</span>}
      </div>
    </div>
  );
}
