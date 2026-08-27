-- M7: 관리자 대시보드용.

-- 관리자 코드 로그인 시도 기록 — 실패가 반복되면 잠그기 위한 용도(11-6).
create table admin_login_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ip text,
  success boolean not null
);

create index idx_admin_login_attempts_ip on admin_login_attempts (ip, created_at);

alter table admin_login_attempts enable row level security;
-- 클라이언트가 직접 접근할 이유 없음(service_role 전용). RLS만 켜고 정책 없음.

-- 출처 링크 유효성 검증 결과 로그 — 관리자 대시보드의 "출처 링크 유효성 검증 실패율"
-- 지표용. src/lib/links/validate-sources.ts에서 검증할 때마다 한 줄씩 남긴다.
-- 어떤 URL인지는 기록하지 않는다 (통계 목적일 뿐 개별 추적 목적이 아님).
create table source_validations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  valid boolean not null
);

create index idx_source_validations_created on source_validations (created_at);

alter table source_validations enable row level security;

-- usage_events에 "이 생성 요청에서 회피 지시가 발동했는지" 컬럼 추가 —
-- 관리자 대시보드의 "겹침 방지 회피 지시 발동 비율" 지표용.
alter table usage_events add column avoidance_triggered boolean not null default false;
