-- 같은 안내문의 분석 결과 재사용(analysis_cache). 새 표 1개와 함수 1개만 추가한다 — 기존 표·데이터는 건드리지 않는다.
-- 승인 후 Supabase SQL Editor에서 실행한다. 코드는 ANALYSIS_CACHE=on일 때만 이 표를 읽고 쓴다(기본 꺼짐).
--
-- 개인정보 없음: 분석 결과(안내문에서 뽑은 조건)와 MinHash 지문(숫자 배열, 글을 되살릴 수 없음)만 저장한다.
-- 전사 원문·학생 입력·사진은 저장하지 않는다. service_role로만 읽고 쓰므로 RLS는 켜 두고 정책은 주지 않는다.
create table if not exists analysis_cache (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  hits integer not null default 0,
  sig bigint[] not null,         -- 전사 글자 2-gram의 MinHash 96개(signature.ts, 32비트 값이라 bigint)
  analysis jsonb not null        -- 분석 결과(core_task_info 등). 전사 원문 notice_text는 뺀 것
);

create index if not exists idx_analysis_cache_used on analysis_cache (last_used_at desc);
alter table analysis_cache enable row level security;

-- 재사용될 때마다 조회수와 최근 사용 시각을 올린다.
create or replace function analysis_cache_touch(row_id uuid) returns void
language sql security definer as $$
  update analysis_cache set hits = hits + 1, last_used_at = now() where id = row_id;
$$;

-- 나쁜 분석이 저장되었을 때 지우는 법: delete from analysis_cache where id = '<id>';  (전체 초기화: truncate analysis_cache;)
