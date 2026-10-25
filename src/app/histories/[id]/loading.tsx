// 결과물 상세를 읽는 동안 보이는 뼈대 화면.
export default function HistoryDetailLoading() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-8" aria-busy="true" aria-live="polite">
      <div className="h-4 w-40 animate-pulse rounded bg-raised" />
      <div className="mt-5 h-7 w-3/4 animate-pulse rounded-lg bg-raised" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-3.5 animate-pulse rounded bg-raised" style={{ width: `${95 - (i % 3) * 12}%` }} />
        ))}
      </div>
    </div>
  );
}
