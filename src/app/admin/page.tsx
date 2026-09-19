import Link from "next/link";
import { requireAdminOrRedirect } from "@/lib/admin/session";
import { getAdminStats } from "@/lib/admin/stats";
import AdminLogoutButton from "./AdminLogoutButton";

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

// F12/11-6: 관리자 통계 대시보드. 집계 수치만 보여준다 — 개별 이메일 나열 없음.
export default async function AdminDashboardPage() {
  await requireAdminOrRedirect();

  const stats = await getAdminStats();
  const loginPct = stats.loginRatio.total > 0 ? stats.loginRatio.loggedIn / stats.loginRatio.total : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">관리자 대시보드</h1>
        <AdminLogoutButton />
      </div>

      <nav className="flex flex-wrap gap-2">
        <Link
          href="/admin/feedback"
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface"
        >
          문의·피드백
        </Link>
        <Link
          href="/admin/users"
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface"
        >
          사용자 목록
        </Link>
        <Link
          href="/admin/announcements"
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface"
        >
          공지사항
        </Link>
      </nav>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted">생성 횟수</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="오늘" value={stats.generations.today} />
          <StatCard label="최근 7일" value={stats.generations.last7Days} />
          <StatCard label="최근 30일" value={stats.generations.last30Days} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted">재생성 횟수</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="오늘" value={stats.regenerations.today} />
          <StatCard label="최근 30일" value={stats.regenerations.last30Days} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted">로그인 / 비로그인 비율 (최근 30일)</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="로그인" value={stats.loginRatio.loggedIn} />
          <StatCard label="비로그인" value={stats.loginRatio.guest} />
          <StatCard label="로그인 비율" value={pct(loginPct)} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted">겹침 방지 지표 (최근 30일)</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="회피 지시 발동 비율" value={pct(stats.avoidanceTriggeredRatio)} />
          <StatCard label="출처 링크 검증 실패율" value={pct(stats.sourceValidationFailureRatio)} />
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
