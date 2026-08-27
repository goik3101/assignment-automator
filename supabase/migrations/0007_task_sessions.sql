-- 다단계 수행평가 세션 (예: 고민쓰기 → 책처방전 → 편지). 각 단계 호출이
-- 이전 단계의 확정된 사실을 "기억"이 아니라 매번 DB 재조회로 명시적으로
-- 이어받게 하기 위한 단일 진실 소스(single source of truth) 구조.
--
-- 필드명을 특정 과제(책처방전)에 고정하지 않고 범용으로 설계했다 — studed는
-- 모든 과목·모든 수행평가를 다루는 서비스라서, 여기 하드코딩하면 다른 과제
-- 유형에는 못 쓰는 구조가 된다. 과제별로 달라지는 값(책 제목/저자, 혹은 다른
-- 과제라면 다른 무언가)은 output_facts(jsonb)에 자유 키로 담는다.
create table task_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  subject text not null,
  core_task_info jsonb not null,
  cluster_id uuid references clusters(id)
);

create index idx_task_sessions_user on task_sessions (user_id, created_at desc);

alter table task_sessions enable row level security;

create policy "task_sessions_select_own"
  on task_sessions for select
  using (auth.uid() = user_id);

create policy "task_sessions_insert_own"
  on task_sessions for insert
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
create table task_session_stages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references task_sessions(id) on delete cascade,
  stage_order integer not null,
  -- 자유 텍스트 (예: "고민쓰기", "책처방전", "편지"). 과제별로 다를 수 있어
  -- enum으로 제한하지 않는다.
  stage_name text not null,
  -- 학생에게 그대로 보여줄 본문 (메타 정보 없이 순수 콘텐츠).
  output_text text not null,
  -- 다음 단계로 그대로 넘겨야 하는 확정된 사실들. 과제마다 키가 다르다
  -- (책처방전이면 {book_title, book_author, quote} 등).
  output_facts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, stage_order)
);

create index idx_task_session_stages_session on task_session_stages (session_id, stage_order);

alter table task_session_stages enable row level security;

-- stages는 session을 통해서만 소유권이 정해지므로 서브쿼리로 확인한다.
create policy "task_session_stages_select_own"
  on task_session_stages for select
  using (exists (
    select 1 from task_sessions s
    where s.id = task_session_stages.session_id and s.user_id = auth.uid()
  ));

create policy "task_session_stages_insert_own"
  on task_session_stages for insert
  with check (exists (
    select 1 from task_sessions s
    where s.id = task_session_stages.session_id and s.user_id = auth.uid()
  ));
