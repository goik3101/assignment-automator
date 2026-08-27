-- studed 초기 스키마
-- 기획서 10번 챕터를 따름. 핵심 원칙: user_histories(개인정보 O)와
-- task_embeddings(개인정보 X)는 FK로 절대 연결하지 않는다.
-- (submission_id 값이 두 테이블에 동일하게 존재하지만, 이건 애플리케이션 레벨의
--  "버전 묶음 식별자"일 뿐 DB 레벨 조인 경로가 아니다. 10번 챕터의 "잔여 재식별 리스크"로
--  인지하고 진행하는 부분.)

create extension if not exists vector;
create extension if not exists pgcrypto; -- gen_random_uuid()

-- ────────────────────────────────────────────────────────────────
-- clusters: 과제 클러스터. "과제 임베딩"(안내문 core_task_info 기반)의
-- centroid만 보관한다. task_embeddings.content_embedding(결과물 임베딩)과는
-- 절대 같은 값이 아니다 (기획서 6-0 핵심 주의사항).
--
-- total_count 컬럼을 일부러 두지 않는다: 비율 기반 억제(6-2)는 실시간 COUNT로
-- 계산해야 롤링 윈도우 정합성이 깨지지 않는다. 트래픽이 커지면 그때 캐시+배치로 전환.
-- ────────────────────────────────────────────────────────────────
create table clusters (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- 차원 수는 .env.example의 GEMINI_EMBEDDING_DIMENSIONS와 반드시 일치해야 함
  centroid_vector vector(768) not null,
  -- centroid_vector 이동평균 갱신 시 가중치로 쓰는 근사치 카운터.
  -- 6-2(비율 억제)의 실시간 COUNT와는 다른 값 — 저건 정확해야 하지만 이건 근사여도
  -- 무방하다고 기획서 10번에 명시되어 있음 ("실질적 문제가 되지 않음").
  match_count integer not null default 1
);

-- ────────────────────────────────────────────────────────────────
-- cluster_match_logs: 클러스터 판정 디버그 로그 (기획서 6-0에서 권장한 대로).
-- "과제 임베딩" 값 자체는 저장하지 않지만, 판정에 쓰인 원본 텍스트는 남겨둔다 —
-- (1) 왜 이 안내문이 이 클러스터로 분류됐는지 추적하기 위해,
-- (2) 애매한 경계 구간에서 LLM에게 "이전에 이 클러스터로 분류된 과제"를 보여주고
--     비교시키기 위한 대표 텍스트로 재사용한다 (src/lib/clusters/identify-cluster.ts).
-- 안내문의 주제/요구사항 텍스트일 뿐 학생 개인정보가 아니므로 이 테이블에 있어도
-- user_histories와의 격리 원칙에 어긋나지 않는다.
-- ────────────────────────────────────────────────────────────────
create table cluster_match_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cluster_id uuid not null references clusters(id) on delete cascade,
  similarity float,
  is_new_cluster boolean not null,
  sample_text text not null
);

create index idx_cluster_match_logs_cluster on cluster_match_logs (cluster_id, created_at desc);

alter table cluster_match_logs enable row level security;

-- ────────────────────────────────────────────────────────────────
-- task_embeddings: 전국 겹침 방지 계산 전용 테이블. 개인정보 없음.
-- content_embedding = 학생이 실제로 받은 완성원고/실행계획(결과물) 전체 텍스트의 임베딩.
-- 6-0의 "과제 임베딩"(안내문 기반, 클러스터 매칭 전용, 여기 저장 안 함)과는 다른 값.
-- ────────────────────────────────────────────────────────────────
create table task_embeddings (
  id uuid primary key default gen_random_uuid(),
  -- user_histories.submission_id와 값은 같을 수 있으나, FK로 연결하지 않는다.
  submission_id uuid not null,
  cluster_id uuid not null references clusters(id) on delete cascade,
  created_at timestamptz not null default now(),
  content_embedding vector(768) not null,
  is_current boolean not null default true
);

-- 6-2 비율 계산(클러스터별 3개월 롤링 윈도우, is_current=true만 집계)이
-- 이 조합으로 매번 실시간 COUNT를 수행하므로 복합 인덱스 필수.
create index idx_task_embeddings_cluster_window
  on task_embeddings (cluster_id, created_at, is_current);

-- 재생성 시 자기 자신의 submission_id를 비교 대상에서 제외할 때 사용.
create index idx_task_embeddings_submission on task_embeddings (submission_id);

-- ────────────────────────────────────────────────────────────────
-- user_histories: 계정·개인 히스토리용. 개인정보 있음.
-- Supabase Auth(auth.users)를 참조하되, task_embeddings 및 clusters와는
-- FK로 연결하지 않는 정책을 이 테이블 전체에 통일 적용한다 (설계 일관성, 10번 챕터).
-- ────────────────────────────────────────────────────────────────
create table user_histories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  raw_text_result text not null,
  -- clusters(id)에 FK를 걸어도 안전하지만(clusters엔 개인정보 없음),
  -- task_embeddings와의 설계 일관성을 위해 이 테이블 전체를 FK-less 정책으로 통일.
  cluster_id uuid,
  submission_id uuid not null,
  is_current boolean not null default true,
  output_type text not null check (output_type in ('essay', 'plan')),
  -- 기획서 원안의 최소 스키마에 실사용 편의를 위해 추가한 컬럼들 (F3/F7 화면 표시용)
  subject text,          -- 과목 (예: 국어)
  title text,            -- 히스토리 목록에 보여줄 짧은 제목
  admin_info jsonb,       -- 행정정보 (제출기한, 감점기준 등) - F3 확인폼 원본
  core_task_info jsonb,   -- 핵심정보 (주제, 요구사항, 수행방식) - F3 확인폼 원본
  instructions text        -- 이번 과제 한정 지침 (F2)
);

create index idx_user_histories_user on user_histories (user_id, created_at desc);
create index idx_user_histories_submission on user_histories (submission_id);

alter table user_histories enable row level security;

create policy "user_histories_select_own"
  on user_histories for select
  using (auth.uid() = user_id);

create policy "user_histories_insert_own"
  on user_histories for insert
  with check (auth.uid() = user_id);

create policy "user_histories_update_own"
  on user_histories for update
  using (auth.uid() = user_id);

-- clusters / task_embeddings에는 개인정보가 없고 클라이언트가 직접 접근할 이유가
-- 없으므로(항상 서버가 service role로 접근) RLS를 켜고 기본적으로 아무 정책도 주지 않는다
-- (= service role 키를 쓰는 서버 요청만 접근 가능, anon 키로는 접근 불가).
alter table clusters enable row level security;
alter table task_embeddings enable row level security;

-- ────────────────────────────────────────────────────────────────
-- user_settings: 설정 탭의 개인화 정보 (F9). 계정당 1행.
-- 기획서에는 별도 테이블로 명시되어 있진 않지만, "히스토리 행"이 아니라 "계정 속성"이라
-- user_histories에 끼워넣기보다 별도 테이블로 분리하는 것이 자연스러워 이렇게 구성함.
-- task_embeddings와는 어떤 방식으로도 연결되지 않음 (개인정보 격리 원칙 동일 적용).
-- ────────────────────────────────────────────────────────────────
create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  interests text,               -- 관심사·경험 (자유 텍스트)
  textbook_publisher text,      -- 교과서 출판사 (분류 정보, 원문 아님 - 7번 챕터 참고)
  school_type text,             -- 학교 유형 (드롭다운, 학교명 자체는 받지 않음)
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;

create policy "user_settings_select_own"
  on user_settings for select
  using (auth.uid() = user_id);

create policy "user_settings_upsert_own"
  on user_settings for insert
  with check (auth.uid() = user_id);

create policy "user_settings_update_own"
  on user_settings for update
  using (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- feedback_submissions: 문의/피드백 (F14). 서비스 전용 채널, 개인 계정 아님.
-- ────────────────────────────────────────────────────────────────
create table feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  message text not null
);

alter table feedback_submissions enable row level security;

create policy "feedback_insert_any"
  on feedback_submissions for insert
  with check (true);
