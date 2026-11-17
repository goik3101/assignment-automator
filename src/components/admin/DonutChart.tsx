// 의존성 없이 그리는 도넛(동그라미) 그래프(서버 컴포넌트). 조각마다 수치와 비율을 범례에 적는다.
export interface DonutSlice {
  label: string;
  value: number;
  /** Tailwind stroke 색 클래스(디자인 토큰만). */
  stroke: string;
  /** 범례 점 색 클래스. */
  dot: string;
}

export default function DonutChart({
  slices,
  center,
  size = 112,
  format = (n) => String(Math.round(n)),
}: {
  slices: DonutSlice[];
  /** 가운데에 적을 글(합계 등). */
  center?: { value: string; label: string };
  size?: number;
  format?: (n: number) => string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = 40;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label={slices.map((s) => `${s.label} ${format(s.value)}`).join(", ")}>
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="14" className="stroke-border" />
          {total > 0 &&
            slices
              .filter((s) => s.value > 0)
              .map((s) => {
                const len = (s.value / total) * c;
                const el = <circle key={s.label} cx="50" cy="50" r={r} fill="none" strokeWidth="14" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} className={s.stroke} />;
                offset += len;
                return el;
              })}
        </svg>
        {center && (
          <div className="absolute inset-0 grid place-content-center text-center">
            <p className="text-lg font-semibold leading-none tabular-nums">{center.value}</p>
            <p className="mt-1 text-[10px] text-faint">{center.label}</p>
          </div>
        )}
      </div>
      <ul className="min-w-0 space-y-1.5 text-xs">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className={`inline-block size-2.5 shrink-0 rounded-full ${s.dot}`} />
            <span className="text-muted">{s.label}</span>
            <span className="ml-1 font-medium tabular-nums">{format(s.value)}</span>
            <span className="tabular-nums text-faint">{total > 0 ? `${Math.round((s.value / total) * 100)}%` : "-"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
