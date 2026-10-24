import Link from "next/link";
import { requireAdminOrRedirect } from "@/lib/admin/session";
import { getAdminStats } from "@/lib/admin/stats";
import { getDashboardData } from "@/lib/admin/dashboard";
import StackedBars from "@/components/admin/StackedBars";
import AdminLogoutButton from "./AdminLogoutButton";

export const dynamic = "force-dynamic";

const USD_KRW = Number(process.env.USD_KRW_RATE ?? 1400); // 원화 환산은 대략적인 참고용 — 환율이 크게 바뀌면 USD_KRW_RATE로 조절

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}
function usd(n: number): string {
  return `$${n.toFixed(n < 10 ? 3 : 2)}`;
}
function krw(n: number): string {
  return `약 ${(Math.round((n * USD_KRW) / 10) * 10).toLocaleString("ko-KR")}원`;
}
function kst(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

const ROUTE_LABELS: Record<string, string> = {
  analyze: "안내문 분석",
  essay: "완성 원고",
  plan: "실행 계획",
  regenerate: "재생성",
  questions: "제작 전 질문",
  expectedQuestions: "예상 질문",
  memoNote: "암기노트",
  studyChat: "AI 채팅",
};
const KIND_LABELS: Record<string, string> = {
  chat: "AI 채팅",
  summary: "요약",
  flashcards: "플래시카드",
  quiz: "퀴즈",
  exam: "가상 시험",
  exam_grade: "시험 채점",
  questions: "제작 전 질문",
  analyze: "안내문 분석",
  expected_questions: "예상 질문",
};

// F12/11-6: 관리자 대시보드. 사용자·AI 사용량·비용·오류·보안 상태를 집계로만 보여준다 — 개별 이메일·사용자 id 나열 없음, IP는 가려서 표시.
export default async function AdminDashboardPage() {
  await requireAdminOrRedirect();

  const [stats, d] = await Promise.all([getAdminStats(), getDashboardData()]);
  const loginPct = stats.loginRatio.total > 0 ? stats.loginRatio.loggedIn / stats.loginRatio.total : 0;
  const { ai, security } = d;
  const f = ai.forecast;
  const budgetPct = ai.budgetUsd ? f.projected / ai.budgetUsd : null;
  const failedChecks = security.config.filter((c) => !c.ok).length;

  const aiRequestDays = ai.days.map((p) => ({
    day: p.day,
    values: { ok: Math.max(0, (p.values.requests ?? 0) - (p.values.errors ?? 0)), errors: p.values.errors ?? 0 },
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">관리자 대시보드</h1>
          <p className="mt-1 text-xs text-faint">최근 30일 · 한국 시간 기준 · {kst(d.generatedAt)} 집계</p>
        </div>
        <AdminLogoutButton />
      </div>

      <nav className="flex flex-wrap gap-2">
        {[
          ["/admin/feedback", "문의·피드백"],
          ["/admin/users", "사용자 목록"],
          ["/admin/announcements", "공지사항"],
        ].map(([href, label]) => (
          <Link key={href} href={href} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface">
            {label}
          </Link>
        ))}
      </nav>

      {/* ── 한눈에 ── */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="전체 사용자" value={`${d.users.total.toLocaleString("ko-KR")}명`} sub={`최근 7일 신규 ${d.users.signups7d}명 · 7일 내 접속 ${d.users.active7d}명`} />
        <StatCard label="오늘 AI 요청" value={ai.today.requests.toLocaleString("ko-KR")} sub={`최근 30일 ${ai.totals30.requests.toLocaleString("ko-KR")}건`} />
        <StatCard label="오늘 오류" value={ai.tableMissing ? "—" : String(ai.today.errors)} sub={ai.tableMissing ? "기록 시작 전" : `30일 오류 ${ai.totals30.errors}건`} tone={ai.today.errors > 0 ? "danger" : undefined} />
        <StatCard label="이번 달 AI 비용" value={usd(f.monthToDate)} sub={`월말 예상 ${usd(f.projected)}`} />
      </section>

      {/* ── AI 사용량 · 오류 · 비용 ── */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted">AI 사용량 · 오류 · 비용</h2>
        {ai.tableMissing && (
          <Notice>
            AI 요청 기록 표(마이그레이션 0018)가 아직 적용되지 않았어요. 지금은 생성 횟수 × 평균 단가({usd(Number(process.env.AI_COST_PER_GENERATION_USD ?? 0.049))})로 비용을 <b>추정</b>하고, 오류 수는 기록되지 않아요.
            적용하면 그 시점부터 실제 사용량·비용·오류가 쌓여요.
          </Notice>
        )}
        {!ai.tableMissing && ai.source === "estimated" && (
          <Notice>아직 기록된 AI 요청이 없어요. 요청이 들어오면 실제 값으로 바뀌고, 그 전까지는 생성 횟수 × 평균 단가로 추정해요.</Notice>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="AI 요청과 오류 (일별)">
            <StackedBars
              data={aiRequestDays}
              series={[
                { key: "ok", label: "정상", className: "bg-foreground" },
                { key: "errors", label: "오류(5xx)", className: "bg-danger" },
              ]}
            />
          </Panel>
          <Panel title={`AI 비용 (일별, USD${ai.source === "estimated" ? " · 추정" : ""})`}>
            <StackedBars data={ai.days} series={[{ key: "cost", label: "비용", className: "bg-foreground" }]} format={usd} />
          </Panel>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">이번 달 비용 예측</h3>
            <span className="text-[11px] text-faint">
              {f.dayOfMonth}일차 / {f.daysInMonth}일 · {ai.source === "measured" ? "실측 기록 기준" : "횟수 × 평균 단가 추정"}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="지금까지" value={usd(f.monthToDate)} sub={krw(f.monthToDate)} />
            <Metric label="하루 평균(최근 7일)" value={usd(f.dailyAverage)} sub={krw(f.dailyAverage)} />
            <Metric label="월말 예상" value={usd(f.projected)} sub={krw(f.projected)} strong />
            <Metric
              label="월 예산 대비"
              value={budgetPct === null ? "예산 미설정" : pct(budgetPct)}
              sub={budgetPct === null ? "AI_MONTHLY_BUDGET_USD로 설정" : `예산 ${usd(ai.budgetUsd!)}`}
              tone={budgetPct !== null && budgetPct >= 0.8 ? "danger" : undefined}
            />
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-faint">
            예상 = 지금까지 + 최근 7일 하루 평균 × 남은 날. 가격표 기준 추정이라 실제 청구액은 OpenAI 대시보드로 확인하세요.
            {ai.totals30.limited > 0 && ` 최근 30일 횟수 제한에 걸린 요청 ${ai.totals30.limited}건.`}
          </p>
        </div>

        {ai.byRoute.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">종류</th>
                  <th className="px-4 py-2 text-right font-medium">요청</th>
                  <th className="px-4 py-2 text-right font-medium">오류</th>
                  <th className="px-4 py-2 text-right font-medium">제한</th>
                  <th className="px-4 py-2 text-right font-medium">평균 비용</th>
                  <th className="px-4 py-2 text-right font-medium">합계</th>
                  <th className="px-4 py-2 text-right font-medium">평균 시간</th>
                  <th className="px-4 py-2 text-right font-medium">느린 쪽(95%)</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {ai.byRoute.map((r) => (
                  <tr key={r.route} className="border-t border-border">
                    <td className="px-4 py-2">{ROUTE_LABELS[r.route] ?? r.route}</td>
                    <td className="px-4 py-2 text-right">{r.requests}</td>
                    <td className={`px-4 py-2 text-right ${r.errors > 0 ? "text-danger" : ""}`}>{r.errors}</td>
                    <td className="px-4 py-2 text-right">{r.limited}</td>
                    <td className="px-4 py-2 text-right">{usd(r.avgCostUsd)}</td>
                    <td className="px-4 py-2 text-right">{usd(r.costUsd)}</td>
                    <td className="px-4 py-2 text-right">{r.avgSeconds === null ? "—" : `${r.avgSeconds.toFixed(1)}초`}</td>
                    <td className={`px-4 py-2 text-right ${r.p95Seconds !== null && r.p95Seconds > 30 ? "text-danger" : ""}`}>{r.p95Seconds === null ? "—" : `${r.p95Seconds.toFixed(1)}초`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-border px-4 py-2 text-[11px] text-faint">시간은 성공한 요청 기준. 생성 목표(30초)를 넘는 95% 값은 빨갛게 표시돼요.</p>
          </div>
        )}

        {ai.recentErrors.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h3 className="mb-2 text-sm font-semibold">최근 오류</h3>
            <ul className="space-y-1 text-sm tabular-nums">
              {ai.recentErrors.map((e, i) => (
                <li key={i} className="flex flex-wrap gap-x-3 text-muted">
                  <span className="w-28 text-faint">{kst(e.at)}</span>
                  <span className="text-foreground">{ROUTE_LABELS[e.route] ?? e.route}</span>
                  <span className="text-danger">{e.status}</span>
                  <span className="text-faint">{e.seconds}초</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-faint">원인(오류 내용)은 개인정보 보호를 위해 저장하지 않아요. 자세한 내용은 Vercel 로그에서 해당 시각을 찾아보세요.</p>
          </div>
        )}
      </section>

      {/* ── 사용자 · 생성 ── */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted">사용자 · 생성</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="생성 횟수 (일별)">
            <StackedBars
              data={d.generations.days}
              series={[
                { key: "login", label: "로그인", className: "bg-foreground" },
                { key: "guest", label: "비로그인", className: "bg-faint" },
                { key: "regen", label: "재생성", className: "bg-muted" },
              ]}
            />
            {d.generations.truncated && <p className="mt-2 text-[11px] text-faint">기록이 많아 일부(최근 2만 건)만 집계했어요.</p>}
          </Panel>
          <Panel title="신규 가입 (일별)">
            <StackedBars data={d.users.signupDays} series={[{ key: "signups", label: "가입", className: "bg-foreground" }]} />
          </Panel>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="30일 신규 가입" value={`${d.users.signups30d}명`} />
          <StatCard label="30일 내 접속" value={`${d.users.active30d}명`} />
          <StatCard label="오늘 생성" value={stats.generations.today} sub={`7일 ${stats.generations.last7Days} · 30일 ${stats.generations.last30Days}`} />
          <StatCard label="로그인 비율(30일)" value={pct(loginPct)} sub={`로그인 ${stats.loginRatio.loggedIn} · 비로그인 ${stats.loginRatio.guest}`} />
        </div>
      </section>

      {/* ── 공부 도구 ── */}
      {d.study && (
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted">공부 도구 사용 (30일 {d.study.total30}회)</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Panel title="일별 사용">
              <StackedBars data={d.study.days} series={[{ key: "uses", label: "사용", className: "bg-foreground" }]} />
            </Panel>
            <Panel title="종류별">
              {d.study.byKind.length === 0 ? (
                <p className="text-sm text-muted">아직 사용 기록이 없어요.</p>
              ) : (
                <ul className="space-y-1.5 text-sm tabular-nums">
                  {d.study.byKind.map((k) => (
                    <li key={k.kind} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-muted">{KIND_LABELS[k.kind] ?? k.kind}</span>
                      <span className="h-1.5 flex-1 rounded-full bg-border">
                        <span className="block h-full rounded-full bg-foreground" style={{ width: `${(k.count / d.study!.byKind[0].count) * 100}%` }} />
                      </span>
                      <span className="w-10 text-right">{k.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </section>
      )}

      {/* ── 품질 지표(기존) ── */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted">품질 지표 (최근 30일)</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard label="재생성 (오늘 / 30일)" value={`${stats.regenerations.today} / ${stats.regenerations.last30Days}`} />
          <StatCard label="회피 지시 발동 비율" value={pct(stats.avoidanceTriggeredRatio)} />
          <StatCard label="출처 링크 검증 실패율" value={pct(stats.sourceValidationFailureRatio)} />
        </div>
      </section>

      {/* ── 보안 ── */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-muted">보안</h2>
          <span className={`text-xs ${failedChecks > 0 ? "text-danger" : "text-faint"}`}>{failedChecks > 0 ? `확인 필요 ${failedChecks}건` : "설정 점검 모두 통과"}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="관리자 로그인 실패(24시간)" value={security.failures24h} tone={security.failures24h >= 10 ? "danger" : undefined} sub={`7일 ${security.failures7d} · 서로 다른 IP ${security.failingIps7d}`} />
          <StatCard
            label="지금 잠긴 IP"
            value={security.lockedIpsNow}
            sub={`${security.lockout.windowMinutes}분 창 전체 실패 ${security.globalFailuresInWindow}/${security.lockout.globalMaxFailures}`}
            tone={security.globalFailuresInWindow >= security.lockout.globalMaxFailures ? "danger" : undefined}
          />
          <StatCard
            label="오늘 전체 생성 / 상한"
            value={`${security.throttle.today} / ${security.throttle.soft}`}
            sub={`하드 상한 ${security.throttle.hard}`}
            tone={security.throttle.today >= security.throttle.soft ? "danger" : undefined}
          />
          <StatCard label="오늘 한도 초과(429)" value={security.limitedToday === null ? "—" : security.limitedToday} sub="한도에 막힌 요청 수" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="설정 점검">
            <ul className="space-y-2 text-sm">
              {security.config.map((c) => (
                <li key={c.id}>
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 text-xs font-semibold ${c.ok ? "text-foreground" : "text-danger"}`}>{c.ok ? "정상" : "확인"}</span>
                    <span className={c.ok ? "text-muted" : "text-foreground"}>{c.label}</span>
                  </div>
                  {!c.ok && <p className="ml-9 mt-0.5 text-[11px] leading-relaxed text-faint">{c.hint}</p>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-faint">환경변수 값은 화면에 나오지 않고, 설정 여부만 확인해요.</p>
          </Panel>

          <Panel title="최근 관리자 로그인 시도 (IP 일부 가림)">
            {security.attempts.length === 0 ? (
              <p className="text-sm text-muted">최근 7일 시도가 없어요.</p>
            ) : (
              <ul className="space-y-1 text-sm tabular-nums">
                {security.attempts.map((a, i) => (
                  <li key={i} className="flex gap-3 text-muted">
                    <span className="w-28 text-faint">{kst(a.at)}</span>
                    <span className={a.success ? "text-foreground" : "text-danger"}>{a.success ? "성공" : "실패"}</span>
                    <span className="text-faint">{a.ip}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-faint">
              내가 하지 않은 성공 기록이 보이면 비밀번호와 ADMIN_SESSION_SECRET을 바로 바꾸세요. 연속 실패는 IP당 {security.lockout.maxFailuresPerIp}회, 전체 {security.lockout.globalMaxFailures}회에서 {security.lockout.windowMinutes}분간 잠겨요.
            </p>
          </Panel>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: "danger" }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone === "danger" ? "text-danger" : ""}`}>{value}</p>
      {sub && <p className="mt-1 text-[11px] leading-snug text-faint">{sub}</p>}
    </div>
  );
}

function Metric({ label, value, sub, strong, tone }: { label: string; value: string; sub?: string; strong?: boolean; tone?: "danger" }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 tabular-nums ${strong ? "text-xl font-semibold" : "text-lg font-medium"} ${tone === "danger" ? "text-danger" : ""}`}>{value}</dd>
      {sub && <p className="text-[11px] text-faint">{sub}</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-border bg-raised px-4 py-3 text-xs leading-relaxed text-muted">{children}</p>;
}
