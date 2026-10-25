// 대시보드 집계(사용자·AI 사용량·보안 점검)를 모으는 동안 보이는 뼈대 화면.
export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-12" aria-busy="true" aria-live="polite">
      <div className="h-7 w-44 animate-pulse rounded-lg bg-raised" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-surface" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-44 animate-pulse rounded-2xl border border-border bg-surface" />
        <div className="h-44 animate-pulse rounded-2xl border border-border bg-surface" />
      </div>
    </div>
  );
}
