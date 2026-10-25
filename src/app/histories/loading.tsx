// 히스토리 목록을 서버에서 읽는 동안 바로 보이는 뼈대 화면 — 페이지를 눌렀을 때 빈 화면 대신 즉시 반응하게 한다.
export default function HistoriesLoading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10" aria-busy="true" aria-live="polite">
      <div className="h-7 w-28 animate-pulse rounded-lg bg-raised" />
      <div className="mb-8 mt-3 h-4 w-64 animate-pulse rounded bg-raised" />
      <ul className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="rounded-xl border border-border bg-surface px-4 py-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-raised" />
            <div className="mt-2.5 h-3 w-1/3 animate-pulse rounded bg-raised" />
          </li>
        ))}
      </ul>
    </div>
  );
}
