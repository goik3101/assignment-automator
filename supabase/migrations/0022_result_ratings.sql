-- 결과물에 대한 사용자 평가(품질·분량) 2가지와, 평가한 결과물의 **개인정보 없는 구조 정보**(칸 이름·칸별 글자 수·시간 등).
-- 새 표 1개만 추가한다 — 기존 표·데이터는 건드리지 않는다. 승인 후 Supabase SQL Editor에서 실행한다.
--
-- 개인정보 없음: 사용자·게스트 id, 결과물 본문, user_histories의 submission_id와 **연결하지 않는다**(CLAUDE.md의 "개인정보 표와 익명 표는 잇지 않는다" 원칙).
-- id는 평가 화면이 만든 임의 uuid일 뿐이다(같은 결과물에서 품질과 분량을 따로 눌러도 한 줄로 합치기 위한 것).
-- 서버가 service_role로만 읽고 쓰므로 RLS는 켜 두고 정책은 주지 않는다.
create table if not exists result_ratings (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  quality text check (quality in ('good', 'bad')),
  length text check (length in ('long', 'ok', 'short')),
  kind text,                       -- essay / plan
  context jsonb not null default '{}'::jsonb  -- { steps: [{label, chars}], totalChars, sources, latencyMs, warnings: {...} }
);

create index if not exists idx_result_ratings_created on result_ratings (created_at desc);
alter table result_ratings enable row level security;
