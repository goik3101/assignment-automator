-- 학습 모드(학생이 자료를 읽고 직접 작성 → AI가 부족한 점을 피드백) 전용 스키마.
-- 기존 자동 작성 모드(user_histories / clusters / task_embeddings / usage_events)와
-- 완전히 분리된 신규 테이블 3개만 추가한다 — 기존 테이블·컬럼·정책은 건드리지 않는다.
-- 학생이 쓴 초안이 결과물 임베딩/쏠림 통계에 섞이지 않게 clusters·task_embeddings와도
-- 연결하지 않는다.

-- 한 번의 학습 과제. 안내문 분석 결과(core_task_info)를 스냅샷으로 들고 있어서
-- 나중에 분석 로직이 바뀌어도 이미 시작한 학습 과제는 그대로 유지된다.
create table learning_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null,
  title text not null,
  core_task_info jsonb not null,
  admin_info jsonb,
  instructions text,
  -- 학생이 다루기로 한 인물/대상(예: 인권 선구자 한 명). 정해진 대상이 없는
  -- 과제이거나 아직 못 정했으면 null.
  focus_subject text,
  -- 'direct' = 학생이 직접 입력, 'ai' = AI 추천 후보 중 선택, 'none' = 해당 없음
  subject_mode text check (subject_mode in ('direct', 'ai', 'none')),
  -- 자료 조사는 과제 전체를 한 번에 조사한다(항목별로 나누면 호출 횟수 제한을 너무 빨리 소진).
  research_status text not null default 'pending'
    check (research_status in ('pending', 'running', 'done', 'failed')),
  status text not null default 'active' check (status in ('active', 'completed')),
  -- 소프트 삭제: 목록에서만 숨기고 데이터는 남긴다(복구 여지).
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_learning_sessions_user on learning_sessions (user_id, updated_at desc)
  where deleted_at is null;

-- 과제에서 요구하는 작성 항목 하나(예: "인물 배경").
create table learning_sections (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references learning_sessions(id) on delete cascade,
  -- RLS를 조인 없이 단순하게 걸기 위해 user_id를 함께 둔다.
  user_id uuid not null references auth.users(id) on delete cascade,
  position int not null,
  label text not null,
  -- 이 항목이 속한 산출물(task_element) 이름 — 여러 산출물이 있는 과제에서 구분용.
  element_label text,
  -- 항목별 조사 자료: { content: markdown([n] 각주 포함), sources: [...] }
  research jsonb,
  -- 학생이 직접 쓴 내용. AI 요청이 실패해도 절대 건드리지 않는다.
  draft text not null default '',
  -- 가장 최근 AI 피드백(구조화 JSON)과 지금까지의 이력.
  feedback jsonb,
  feedback_history jsonb not null default '[]'::jsonb,
  revision_count int not null default 0,
  status text not null default 'not_started'
    check (status in ('not_started', 'researching', 'writing', 'feedback', 'revision', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, position)
);

create index idx_learning_sections_session on learning_sections (session_id, position);

-- 학습 모드 AI 호출(자료 조사 + 피드백) 횟수 제한용 기록. usage_events(0004)의
-- event_type CHECK가 ('generate','regenerate')만 허용해서 그 표를 건드리지 않고
-- 별도로 둔다. usage_events와 같은 패턴: 서버가 service_role로만 읽고 쓰므로
-- RLS는 켜두고 정책은 주지 않는다.
create table learning_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('research', 'feedback')),
  created_at timestamptz not null default now()
);

create index idx_learning_usage_user_day on learning_usage_events (user_id, created_at desc);

alter table learning_usage_events enable row level security;

-- user_histories와 같은 원칙: 본인 행만.
alter table learning_sessions enable row level security;
alter table learning_sections enable row level security;

create policy "learning_sessions_select_own" on learning_sessions for select using (auth.uid() = user_id);
create policy "learning_sessions_insert_own" on learning_sessions for insert with check (auth.uid() = user_id);
create policy "learning_sessions_update_own" on learning_sessions for update using (auth.uid() = user_id);
create policy "learning_sessions_delete_own" on learning_sessions for delete using (auth.uid() = user_id);

create policy "learning_sections_select_own" on learning_sections for select using (auth.uid() = user_id);
create policy "learning_sections_insert_own" on learning_sections for insert with check (auth.uid() = user_id);
create policy "learning_sections_update_own" on learning_sections for update using (auth.uid() = user_id);
create policy "learning_sections_delete_own" on learning_sections for delete using (auth.uid() = user_id);
